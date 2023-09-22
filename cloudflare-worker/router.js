import { Router } from 'itty-router';
import { connect } from '@planetscale/database';

const router = Router();

// GET positions - TODO
router.get("/api/get-positions/:id", ({ params }) => success({userId: params.id, positions: []}));

router.options("*", async(request, env, ctx) => {
	return success({});
});

/**
 * Record a position for the user
 */
router.post("/api/record-position", async(request, env) => {
	const content = await request.json();

	const {lat, lng, userId, nick} = content;
	const conn = getDatabaseConnection(env);

	const r_earth = 6378.137; // Radius of earth in KM
	const m = 1 / (((2 * Math.PI) / 360) * r_earth) / 1000; // Length of 1 meter in degrees
	const distance = 50; // 50 meters for bounding box

	const degrees = distance * m;
	const dLat = degrees / Math.cos(lat * (Math.PI / 180));

	const minLatitude = lat - degrees;
	const maxLatitude = lat + degrees;
	const minLongitude = lng - dLat;
	const maxLongitude = lng + dLat;

	try {
		// Make sure user hasn't recorded a nearby position previously.
		let sql = `
			SELECT lat, lng
			FROM positions
			WHERE user_id = ?
				AND lat BETWEEN ? AND ?
				AND lng BETWEEN ? AND ?
		`;
		const {rows} = await conn.execute(sql, [userId, minLatitude, maxLatitude, minLongitude, maxLongitude]);

		if (rows.length <= 0) {
			sql = "INSERT INTO positions (user_id, nick, lat, lng, created_at) VALUES (?, ?, ?, ?, NOW())";
			await conn.execute(sql, [userId, nick, lat, lng]);
		}

		return success(content);
	} catch (ex) {
		return fail(ex);
	}
});

// 404 for everything else
router.all("*", () => new Response(JSON.stringify({ success: false }), { status: 404 }));

function getDatabaseConnection(env) {
	const config = {
		host: env.DATABASE_HOST || env.DB_HOST || "aws.connect.pddb.cloud",
		username: env.DATABASE_USERNAME || env.DB_USERNAME,
		password: env.DATABASE_PASSWORD || env.DB_PASSWORD,
		fetch: (url, init) => {
			delete init["cache"]
			return fetch(url, init)
		}
	};

	return connect(config);
}

function success(data) {
	return new Response(JSON.stringify({success: true, data}), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
			"Access-Control-Allow-Headers": "Origin, Content-Type, x-requested-with, Accept"
		},
	});
}

function fail(data) {
	return new Response(JSON.stringify({success: false, data}), {
		status: 400,
		headers: {
			"Content-Type": "application/json",
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
			"Access-Control-Allow-Headers": "Origin, Content-Type, x-requested-with, Accept"
		},
	});
}

export default router;
