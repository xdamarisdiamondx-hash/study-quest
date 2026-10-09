import { app } from "../../apps/server/src/app.ts";

export default {
  async fetch(request: Request) {
    return app.fetch(request);
  },
};
