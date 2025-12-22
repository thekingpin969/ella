import { Hono } from "hono";
import createProject from "./createProject";
import getProject from "./getProject";
import getArtifacts from "./getArtifacts";
import getArtifact from "./getArtifact";

const projectRoutes = new Hono();

projectRoutes.route("/", createProject);
projectRoutes.route("/", getProject);
projectRoutes.route("/", getArtifacts);
projectRoutes.route("/", getArtifact);

export default projectRoutes;
