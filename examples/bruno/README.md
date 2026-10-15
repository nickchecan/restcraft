# Bruno import examples

These examples contain three independent Bruno collections. Importing only creates request files; sending a request is a separate action in RestCraft.

On Windows/Linux, the command first asks **Request file** or **Collection folder** to accommodate native dialog restrictions. On macOS, the picker accepts either directly.

## Import a collection

Open the Command Palette (**Cmd+Shift+P** / **Ctrl+Shift+P**) and choose **RestCraft: Import from Bruno**. Select one of these folders, then choose a destination parent folder:

- `public-api`: three JSONPlaceholder requests, including a path parameter, disabled query/header entries, a JSON body, inherited headers, and nested `Users/Posts` folders.
- `yaml-api`: six OpenCollection YAML requests, including nested folders, disabled query/header entries, JSON, form and text bodies, and inherited or explicit bearer authentication. This collection uses `opencollection.yml`.
- `echo-api`: six HTTPBin requests covering JSON, form-urlencoded, XML, text, explicit bearer authentication, and inherited folder authentication.

Select the collection folder containing `bruno.json` or `opencollection.yml`, rather than this top-level `bruno` folder. The importer creates `public-api`, `echo-api`, or `yaml-api` under the destination and preserves its request folder hierarchy. Choose a destination where that collection folder does not already exist.

## Import an individual request

Choose **RestCraft: Import from Bruno**, select a `.bru`, `.yml`, or `.yaml` request file, and choose where to save the `.api.json` output. Good starting points are:

- `yaml-api/Users/list-users.yml`
- `yaml-api/Users/Posts/create-post.yml`
- `yaml-api/Auth/explicit-bearer.yml`
- `public-api/Users/list-users.bru`
- `public-api/Users/Posts/create-post.bru`
- `echo-api/Bodies/send-form.bru`
- `echo-api/Auth/explicit-bearer.bru`

Use collection import for `echo-api/Auth/inherited-bearer.bru` or `yaml-api/Auth/inherited-bearer.yml` so its folder authentication is applied. Standalone imports do not include collection or folder headers.

All bearer tokens here are public demo values. JSONPlaceholder simulates writes; HTTPBin echoes request data. These examples need internet access when you send them, but require no account or private credentials.
