# Hacking on SolyncStatus

## Adding a tracked service

First, add the service to the `services` collection by adding a json file to `src/content/services/`.

Then, import and add the service to the `services` map in `worker/src/services.ts`.

Look at existing services for examples.
