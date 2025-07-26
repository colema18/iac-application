import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

// Reference outputs from the infra stack
const infraStack = new pulumi.StackReference("colema18/iac-infra/dev"); 
// 👆 Replace org-name and stack name with yours

const kubeconfig = infraStack.getOutput("kubeconfigOut");

const provider = new k8s.Provider("k8s-provider", {
    kubeconfig: kubeconfig.apply(JSON.stringify),
});

// ------------------------
// Backend Deployment & Service
// ------------------------

const backendLabels = { app: "backend" };

const backEndDeployment = new k8s.apps.v1.Deployment("backend-deployment", {
    spec: {
        selector: { matchLabels: backendLabels },
        replicas: 2,
        template: {
            metadata: { labels: backendLabels },
            spec: {
                containers: [
                    {
                        name: "backend",
                        image: "ghcr.io/colema18/hello-pulumi-app:1.02",
                        ports: [{ containerPort: 5050 }],
                    },
                ],
            },
        },
    },
}, { provider });

const backEndService = new k8s.core.v1.Service("backend-service", {
    spec: {
        type: "LoadBalancer",
        selector: backendLabels,
        ports: [{ port: 5050, targetPort: 5050 }],
    },
}, { provider });

// ------------------------
// Frontend Deployment & Service
// ------------------------

const frontendLabels = { app: "frontend" };

const apiUrl = backEndService.status.loadBalancer.ingress.apply(
    (ingress) => ingress && ingress[0]?.hostname ? `http://${ingress[0].hostname}:5050` : ""
);

const frontEndDeployment = new k8s.apps.v1.Deployment("frontend-deployment", {
    spec: {
        selector: { matchLabels: frontendLabels },
        replicas: 2,
        template: {
            metadata: {
                labels: frontendLabels,
                annotations: {
                    "api-url-hash": apiUrl.apply((url) => Buffer.from(url).toString("base64")),
                },
            },
            spec: {
                containers: [
                    {
                        name: "frontend",
                        image: "ghcr.io/colema18/hello-pulumi-ui:1.02",
                        ports: [{ containerPort: 80 }],
                        env: [{ name: "API_URL", value: apiUrl }],
                    },
                ],
            },
        },
    },
}, { provider, dependsOn: backEndService });

const frontEndService = new k8s.core.v1.Service("frontend-service", {
    spec: {
        type: "LoadBalancer",
        selector: frontendLabels,
        ports: [{ port: 80, targetPort: 80 }],
    },
}, { provider });

// ------------------------
// Outputs
// ------------------------

export const backEndUrl = backEndService.status.loadBalancer.ingress.apply(
    (ingress) => ingress && ingress[0]?.hostname ? `http://${ingress[0].hostname}:5050` : "pending..."
);

export const frontEndUrl = frontEndService.status.loadBalancer.ingress.apply(
    (ingress) => ingress && ingress[0]?.hostname ? `http://${ingress[0].hostname}` : "pending..."
);
