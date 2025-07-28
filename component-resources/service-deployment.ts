import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

export interface ServiceDeploymentArgs {
    provider: k8s.Provider;
    labels: { [key: string]: string };
    replicas: number;
    image: string;
    containerPort: number;
    servicePort: number;
    env?: pulumi.Input<k8s.types.input.core.v1.EnvVar[]>;
    dependsOn?: pulumi.Input<pulumi.Resource>[];
    serviceAccountName?: pulumi.Input<string>; // ✅ New property
}

export default class ServiceDeployment extends pulumi.ComponentResource {
    public readonly deployment: k8s.apps.v1.Deployment;
    public readonly service: k8s.core.v1.Service;
    public readonly url: pulumi.Output<string>;

    constructor(name: string, args: ServiceDeploymentArgs, opts?: pulumi.ComponentResourceOptions) {
        super("custom:app:ServiceDeployment", name, {}, opts);

        // ✅ Add serviceAccountName to the pod spec
        this.deployment = new k8s.apps.v1.Deployment(`${name}-deployment`, {
            spec: {
                selector: { matchLabels: args.labels },
                replicas: args.replicas,
                template: {
                    metadata: { labels: args.labels },
                    spec: {
                        serviceAccountName: args.serviceAccountName, // ✅ Added here
                        containers: [
                            {
                                name: name,
                                image: args.image,
                                ports: [{ containerPort: args.containerPort }],
                                env: args.env,
                            },
                        ],
                    },
                },
            },
        }, { provider: args.provider, parent: this, dependsOn: args.dependsOn });

        this.service = new k8s.core.v1.Service(`${name}-service`, {
            spec: {
                type: "LoadBalancer",
                selector: args.labels,
                ports: [{ port: args.servicePort, targetPort: args.containerPort }],
            },
        }, { provider: args.provider, parent: this });

        this.url = this.service.status.loadBalancer.ingress.apply(
            ingress => ingress && ingress[0]?.hostname
                ? `http://${ingress[0].hostname}:${args.servicePort}`
                : "pending..."
        );

        this.registerOutputs({
            deployment: this.deployment,
            service: this.service,
            url: this.url,
        });
    }
}
