import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { Vpc } from "./construct/vpc";
import { Alb } from "./construct/alb";
import { Route53HostedZone } from "./construct/route53-hosted-zone";

export class AlbStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const zoneName = "web.non-97.net";

    // Route 53 Hosted Zone
    const hostedZone = new Route53HostedZone(this, "Route53HostedZone", {
      zoneName,
    });

    // VPC
    const vpc = new Vpc(this, "Vpc");

    // ALB
    const alb = new Alb(this, "Alb", {
      vpc: vpc.vpc,
      hostedZone: hostedZone.hostedZone,
    });
  }
}
