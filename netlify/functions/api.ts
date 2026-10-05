import { app } from "../../apps/server/src/index.ts";

export default {
  async fetch(request: Request) {
    return app.fetch(request);
  },
};