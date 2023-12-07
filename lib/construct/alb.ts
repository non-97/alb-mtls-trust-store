import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";
import * as fs from "fs";

export interface AlbProps {
  vpc: cdk.aws_ec2.IVpc;
  hostedZone: cdk.aws_route53.IHostedZone;
}

export class Alb extends Construct {
  readonly alb: cdk.aws_elasticloadbalancingv2.IApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: AlbProps) {
    super(scope, id);

    // ACM
    const certificate = new cdk.aws_certificatemanager.Certificate(
      this,
      "Certificate",
      {
        domainName: `mtls-test.${props.hostedZone.zoneName}`,
        validation: cdk.aws_certificatemanager.CertificateValidation.fromDns(
          props.hostedZone
        ),
      }
    );

    // Trust store and connection log S3 Bucket
    const bucket = new cdk.aws_s3.Bucket(this, "Bucket", {
      encryption: cdk.aws_s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: new cdk.aws_s3.BlockPublicAccess({
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
      }),
      enforceSSL: true,
      versioned: false,
    });
    bucket.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ["s3:PutObject"],
        principals: [new cdk.aws_iam.AccountPrincipal("127311923021")],
        resources: [`${bucket.bucketArn}/*`],
      })
    );

    // Deploy CA cert
    const deployCaCert = new cdk.aws_s3_deployment.BucketDeployment(
      this,
      "DeployCaCert",
      {
        sources: [
          cdk.aws_s3_deployment.Source.data(
            "cacert.pem",
            fs.readFileSync(path.join(__dirname, "../cacert.pem"), "utf8")
          ),
        ],
        destinationBucket: bucket,
        extract: true,
      }
    );

    // Trust store
    const cfnTrustStore = new cdk.aws_elasticloadbalancingv2.CfnTrustStore(
      this,
      "TrustStore",
      {
        caCertificatesBundleS3Bucket: deployCaCert.deployedBucket.bucketName,
        caCertificatesBundleS3Key: "cacert.pem",
        name: "trust-store",
      }
    );
    cfnTrustStore.node.addDependency(deployCaCert);

    // ALB
    this.alb = new cdk.aws_elasticloadbalancingv2.ApplicationLoadBalancer(
      this,
      "Default",
      {
        vpc: props.vpc,
        internetFacing: true,
        vpcSubnets: {
          subnets: props.vpc.publicSubnets,
        },
      }
    );

    const cfnAlb = this.alb.node
      .defaultChild as cdk.aws_elasticloadbalancingv2.CfnLoadBalancer;

    cfnAlb.loadBalancerAttributes = [
      {
        key: "connection_logs.s3.enabled",
        value: "true",
      },
      {
        key: "connection_logs.s3.bucket",
        value: bucket.bucketName,
      },
    ];

    // Listener
    const listenerHttps = this.alb.addListener("ListenerHttps", {
      port: 443,
      protocol: cdk.aws_elasticloadbalancingv2.ApplicationProtocol.HTTPS,
      certificates: [certificate],
      sslPolicy: cdk.aws_elasticloadbalancingv2.SslPolicy.RECOMMENDED_TLS,
      defaultAction:
        cdk.aws_elasticloadbalancingv2.ListenerAction.fixedResponse(200, {
          contentType: "text/plain",
          messageBody: "mTLS",
        }),
    });

    const cfnListenerHttps = listenerHttps.node
      .defaultChild as cdk.aws_elasticloadbalancingv2.CfnListener;
    cfnListenerHttps.mutualAuthentication = {
      ignoreClientCertificateExpiry: false,
      mode: "verify",
      trustStoreArn: cfnTrustStore.ref,
    };

    // Alias
    new cdk.aws_route53.ARecord(this, "Alias", {
      zone: props.hostedZone,
      recordName: `mtls-test.${props.hostedZone.zoneName}`,
      target: cdk.aws_route53.RecordTarget.fromAlias(
        new cdk.aws_route53_targets.LoadBalancerTarget(this.alb)
      ),
    });
  }
}
