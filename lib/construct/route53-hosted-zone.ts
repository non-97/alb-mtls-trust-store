import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface Route53HostedZoneProps {
  zoneName: string;
}

export class Route53HostedZone extends Construct {
  readonly hostedZone: cdk.aws_route53.IHostedZone;

  constructor(scope: Construct, id: string, props: Route53HostedZoneProps) {
    super(scope, id);

    this.hostedZone = new cdk.aws_route53.PublicHostedZone(this, "Default", {
      zoneName: "web.non-97.net",
    });
  }
}
