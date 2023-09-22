import apiRouter from './router';

const html = (content) => {
	return new Response(
		content,
		{
			status: 200,
			headers: {
				"Content-Type": "text/html",
			},
		}
	);
}

// Export a default object containing event handlers
export default {

	// The fetch handler is invoked when this worker receives a HTTP(S) request
	// and should return a Response (optionally wrapped in a Promise)
	async fetch(request, env, ctx) {
		// console.log(JSON.stringify(request.cf));

		// You'll find it helpful to parse the request.url string into a URL object.
		const url = new URL(request.url);

		// You can get pretty far with simple logic like if/switch-statements
		switch (url.pathname) {
			case '/about':
				return html("Geoguessr Recorder Server v0.0.1");
		}

		if (url.pathname.startsWith('/api/')) {
			return apiRouter.handle(request, env, ctx);
		}

		// Generic response.
		return html(`<h1>GeuGuessr Recorder Server</h1>`);
	},
};
