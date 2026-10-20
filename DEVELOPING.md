# Hacking on SolyncStatus

## Adding a tracked service

First, add the service to the `services` collection by adding a json file to `src/content/services/`.

Then, import and add the service to the `services` map in `worker/src/services.ts`.

Look at existing services for examples.

## Service Fields
| Property             | Type     | Description                                                                                                  |
|----------------------|----------|--------------------------------------------------------------------------------------------------------------|
| `name`               | `string` | Name label of service.                                                                                       |
| `url`                | `string` | URL destination of service. Used for connectivity tests as well as a hyperlink to this service.              |
| `iconURL` (optional) | `string` | URL destination of an image used as this service's icon. Any file format supported by `<img/>` is valid.     |
