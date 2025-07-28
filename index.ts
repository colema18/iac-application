import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import ServiceDeployment from "./component-resources/service-deployment";

const config = new pulumi.Config("iac-application");
const helloPulumiUiImageTag = config.require("helloPulumiUiImageTag");
const helloPulumiAppImageTag = config.require("helloPulumiAppImageTag");



// Reference outputs from the infra stack
const infraStack = new pulumi.StackReference("coleman/iac-infra/dev"); 

const kubeconfig = infraStack.getOutput("kubeconfigOut");

const provider = new k8s.Provider("k8s-provider", {
    kubeconfig: kubeconfig.apply(JSON.stringify),
});

// ------------------------
// Backend
// ------------------------
const backend = new ServiceDeployment("backend", {
    provider,
    labels: { app: "backend" },
    replicas: 2,
    image: `ghcr.io/colema18/hello-pulumi-app:${helloPulumiAppImageTag}`,
    containerPort: 5050,
    servicePort: 5050,
});

export const backEndUrl = backend.url;

// ------------------------
// Frontend (depends on backend URL)
// ------------------------
const apiUrl = backend.url.apply(url => url.replace(/:\d+$/, ":5050"));

const frontend = new ServiceDeployment("frontend", {
    provider,
    labels: { app: "frontend" },
    replicas: 2,
    image: `ghcr.io/colema18/hello-pulumi-ui:${helloPulumiUiImageTag}`,
    containerPort: 80,
    servicePort: 80,
    env: [{ name: "API_URL", value: apiUrl }],
    dependsOn: [backend.service],
});

export const frontEndUrl = frontend.url;
