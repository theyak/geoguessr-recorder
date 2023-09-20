# Database Configuration

This Cloudflare worker connects to a PlanetScale database via the
[Serverless Driver for JavaScript](https://github.com/planetscale/database-js).
In order to connect the worker to the database, a few configuration variables
must be set.

In your _wranger.toml_ file, add the following to the `[vars]` section.
If your config file does not already have a `[vars]` section, you will need
to add it.

```
[vars]
DATABASE_HOST = "aws.connect.psdb.cloud"
DATABASE_USERNAME = "planetscaleusername"
```

You should also create a [Cloudflare Secret](https://developers.cloudflare.com/workers/configuration/secrets/)
value named `DATABASE_PASSWORD` to store your database password. This can be done from the dashboard or via
the wrangler utility.

```sh
wrangler secret put DATABASE_PASSWORD
```

If you plan to develop locally, you should also make a file called _.dev.vars_
in the root directory which contains the DATABASE_PASSWORD value. Please see
the _.dev.vars.sample_ file for a sample of the _.dev.vars_ file.

## Schema

In the PlanetScale create a new database called _geoguessr_.

Navigate into the new _geoguessr_ database and run the following to create the needed schema;

```sql
CREATE TABLE `positions` (
	`id` INT NOT NULL AUTO_INCREMENT,
	`user_id` CHAR(32) NOT NULL,
	`nick` VARCHAR(48) NOT NULL,
	`lat` DOUBLE NOT NULL,
	`lng` DOUBLE NOT NULL,
	`created_at` DATETIME NOT NULL,
	PRIMARY KEY (`id`),
	INDEX `user_lat_lng` (`user_id`, `lat`, `lng`)
) ENGINE = InnoDB;
```

# Run Locally

```sh
npm run start
```

Navigate to https://127.0.0.1:8787 for a sample page.

# Deploy to Cloudflare

```
npx wrangler deploy
```
