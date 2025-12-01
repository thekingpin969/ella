import { Hono } from "hono";
import projectRoutes from "./project";

const projects = new Hono();

projects.route("/", projectRoutes);

export default projects;
