// ==UserScript==
// @name         GeoGuessr Recorder
// @namespace    theyak
// @version      0.1
// @description  Record positions visited in GeoGuessr
// @author       theyak
// @match        https://www.geoguessr.com/*
// @run-at       document-start
// ==/UserScript==

// Script has only been made to work with single player standard and streak modes.
// It might work with standard multi-player mode
// It does not work with battle royale as I never play that.
//
// GeoGuessr is largely played on the honor system. Please do not use this script or any other method to cheat.
//
// TODO:
// * Update record-position endpoint to work with new gameData
// * Come up with a way to view location data
// * Come up with a way to make a private api key
// * Figure out what to do if teleport fails
// * Fix round-ended event from firing when starting streaks
// * After playing single rounds, I went to a regular game and round-started fired twice. Fix that.

// Change host to wherever server is running.
// Usually http://127.0.0.1:4321/ for local servers
// Usually https://geoguessr.zyzzx.workers.dev/api for remote
const URL = "http://localhost:4321/";

// Change token to whatever you were assigned in the web app.
// You can also store it in localStorage while on the GeoGuessr website.
// localStorage.setItem("user_token", "your-token-here");
const TOKEN = localStorage.getItem("user_token") || "your-token-here";

/**
 * @typdef {Object} Position
 * @property {number} lat
 * @property {number} lng
 * @property {number} pitch
 * @property {number} heading
 */

/**
 * @typedef {Object} GameData Various information about game, including map, player, round number, etc.
 */

function Geoguessr() {
    /**
     * @type {Number}
     * Round number
     */
    let roundNumber = 0;

    /**
     * @type {Object}
     * Event handlers
     */
    let events = {};

    /**
     * Google Map object
     */
    let map;

    /**
     * The main streetview display
     */
    let panorama;

    /**
     * Game data from AJAX request.
     */
    let gameData = {};

    /**
     * Window object
     */
    let win = unsafeWindow || window;

    /**
     * Original fetch function
     */
    const {fetch: origFetch} = win;

    /**
     * Current player position
     */
    const position = {lat: 0, lng: 0, pitch: 0, heading: 0};

    /**
     * Fetch interceptor to read data from games endpoint.
     * Probably only works for single player games for now. Definitely doesn't work for Battle Royale Distance
     * The GET request indicates a new round.
     * The POST request indicates finished round or when starting a new game and URL doesn't have a game ID.
     * The only problem is this doesn't fire when refreshing game or starting a game.
     * With a refresh, the data is in __NEXT_DATA__.props.pageProps
     * The being said, it can be loaded from GET https://www.geoguessr.com/api/v3/games/[game-id]?client=web
     * When starting a new game, it calls POST https://www.geoguessr.com/api/v3/games with the following data:
     *  - forbidMoving
     *  - forbidZooming
     *  - map: "map id"
     *  - rounds: 5
     *. - timeLimit: 0 for inifinity
     *  - type: "standard"
     */
    win.fetch = async (...args) => {
        const url = args[0];
        const response = await origFetch(...args);

        if (url.indexOf("https://www.geoguessr.com/api/v3/games") >= 0) {
            const method = args[1].method;

            response.clone().json().then(data => {
                gameData = data;
                if (method === "POST") {
                    if (url === "https://www.geoguessr.com/api/v3/games" || url === "https://www.geoguessr.com/api/v3/games/streak") {
                        emitRoundStart(data);
                    } else {
                        // data.state is usually "started", but changes to "finished" after last round.
                        // This is provided before the results page.
                        emitRoundEnd(data);
                    }
                } else {
                    // data.mode is "streak" for streak games"
                    emitRoundStart(data);
                }
            })
            .catch(err => console.error(err));
        }

        return response;
    };

    /**
     * Check if the current location is a game page
     *
     * @return {boolean}
     */
    function isGamePage() {
        return location.pathname.startsWith("/challenge/") ||
            location.pathname.startsWith("/results/") ||
            location.pathname.startsWith("/game/") ||
            location.pathname.startsWith("/battle-royale/") ||
            location.pathname.startsWith("/duels/") ||
            location.pathname.startsWith("/team-duels/") ||
            location.pathname.startsWith("/bullseye/") ||
            location.pathname.startsWith("/live-challenge/");
    }

    /**
     * Emit the round-start event, making sure it is not sent twice in a row.
     *
     * @param {*} data The current game data.
     */
    function emitRoundStart(data) {
        if (!data) {
            data = gameData;
        }

        const hash = `${data.token}-${data.round}`;
        if (hash !== emitRoundStart.lastHash) {
            emit("round-start", data);
            emitRoundStart.lastHash = hash;
        }
    }
    emitRoundStart.lastHash = "";

    /**
     * Emit the round-end event, making sure it is not sent twice in a row.
     *
     * @param {GameData} data The current game data.
     */
    function emitRoundEnd(data) {
        if (!data) {
            data = gameData;
        }

        const hash = `${data.token}-${data.round}`;
        if (hash !== emitRoundStart.lastHash) {
            emit("round-end", data);

            if (data.state === "finished") {
                emit("game-end", data);
            }
            emitRoundEnd.lastHash = hash;
        }
    }
    emitRoundEnd.lastHash = "";


    /**
     * Check for various DOM manipulations indicating a certain state
     *
     * @param {HTMLElement}
     */
    function onNodeAdded(node) {
        if (node.tagName !== "DIV" && node.tagName !== "BUTTON") {
            return;
        }

        if (!node.classList || node.classList.length <= 0) {
            return;
        }

        if (node.className.startsWith("result-layout_root")) {
            // streaks/quick play
            if (document.querySelector('[data-qa="play-again-button"]')) {
                // emit("game-end", gameData);
            }

            roundNumber = 0;
        } else if (node.className.startsWith("standard-final-result_wrapper")) {
            // Classic/explorer
            // emit("game-end", gameData);
        } else if (node.querySelector('[data-qa="pano-zoom-in"]')) {
            // If we get here and no data was loaded via fetch call, then that means we did a refresh and data is in __NEXT_DATA__.
            if (Object.keys(gameData).length <= 0) {
                const dom = document.getElementById("__NEXT_DATA__");
                if (!dom) {
                    return null;
                }
                const data = JSON.parse(dom.innerText);
                if (data.props && data.props.pageProps) {
                    gameData = data.props.pageProps.game;
                    emitRoundStart(gameData);
                }
            }
        }
    }

    /**
     * Set up a basic DOM observer so we can watch for basic game events.
     */
    function setupMutationObserver() {
        const observer = new MutationObserver((mutations) => {
            const win = unsafeWindow || window;
            if (!win.google) {
                return;
            }

            mutations.forEach((mutation) => {
                if (mutation.addedNodes) {
                    mutation.addedNodes.forEach((node) => onNodeAdded(node));
                }
            });
        });
        observer.observe(document.body, {childList: true, subtree: true, attributes: false, characterData: false})
    }

    // Google Maps observer
    /**
     * Function to run when Google Maps has loaded.
     * For our purposes, we add a listener to the panorama service
     * to keep watch of our current position
     *
     * @param {Object} google The Google API that was loaded. Should have a maps object for the Maps API.
     */
    function onGoogleMapsLoaded(google) {
        google.maps.StreetViewPanorama = class extends google.maps.StreetViewPanorama {
            constructor(...args) {
                super(...args);

                panorama = this;
                map = google.maps;
                emit("ready", { panorama, map });

                this.addListener('position_changed', () => {
                    if (isGamePage()) {
                        const lat = this.getPosition().lat();
                        const lng = this.getPosition().lng();
                        if (position.lat !== lat || position.lng !== lng) {
                            position.lat = lat;
                            position.lng = lng;
                            emit("position-changed", {
                                position,
                                game: gameData,
                            });
                        }
                    }
                });

                // This fires a lot! If doing UI changes, you might want to debounce your event handler.
                this.addListener("pov_changed", () => {
                    if (isGamePage()) {
                        const heading = this.getPov().heading;
                        const pitch = this.getPov().pitch;
                        if (position.pitch !== pitch || position.heading !== heading) {
                            position.pitch = pitch;
                            position.heading = heading;
                            emit("pov-changed", {
                                position,
                                game: gameData,
                            });
                        }
                    }
                });
            }
        };
    }

    /**
     * Watch for Google Maps to be loaded and then call the callback (onGoogleMapsLoaded)
     * function when it is loaded.
     *
     * Modified from GeoGuessr Unity Script which is modified from
     * extenssr: https://gitlab.com/nonreviad/extenssr/-/blob/main/src/injected_scripts/maps_api_injecter.ts
     */
    function watchForGoogleMaps(callback) {
        function getGoogleMapsIfAvailable(mutations) {
            for (const mutation of mutations) {
                for (const newNode of mutation.addedNodes) {
                    if (newNode && newNode.src && newNode.src.startsWith('https://maps.googleapis.com/maps/api/js?')) {
                        return newNode;
                    }
                }
            }
            return null;
        }

        // Get google maps library when GeoGuessr loads it.
        if (document.documentElement) {
            const observer = new MutationObserver((mutations, observer) => {
                const googleScript = getGoogleMapsIfAvailable(mutations);
                if (googleScript) {
                    const oldOnload = googleScript.onload;
                    googleScript.onload = (event) => {
                        const google = window.google || unsafeWindow.google;
                        if (google) {
                            observer.disconnect();
                            callback(google);
                        } else {
                            console.log("No window.google");
                        }
                        if (oldOnload) {
                            oldOnload.call(googleScript, event);
                        }
                    };
                }
            });
            observer.observe(document.documentElement, {childList: true, subtree: true });
        }
    }

    watchForGoogleMaps(onGoogleMapsLoaded);
    if (document.body) {
        setupMutationObserver();
    } else {
        window.addEventListener('DOMContentLoaded', (event) => {
            setupMutationObserver();
        });
    }


	//
	// Event Emitter
	//

	function on(event, listener) {
		if (!events[event]) {
			events[event] = [];
		}
		events[event].push(listener);
	}

	function off(event, listener) {
		const eventListeners = events[event];
		if (eventListeners) {
			events[event] = eventListeners.filter((l) => l !== listener);
		}
	}

    function emit(event, ...args) {
		let eventListeners = events[event];

		if (eventListeners) {
			eventListeners.forEach((listener) => {
				listener(...args);
			});
		} else {
			eventListeners = events.unhandled || events.default;
			if (eventListeners) {
				eventListeners.forEach((listener) => {
					listener(event, ...args);
				});
			}
		}

		eventListeners = events["*"];
		if (eventListeners) {
			eventListeners.forEach((listener) => {
				listener(event, ...args);
			});
		}
	}

	return {
		on,
		off,
        isGamePage,
        position
	};
}

(function() {

    /**
     * @type {{lng: number, lat: number}[]}
     * Log of locations that were recorded
     */
    const positionHistory = [];

    // Radius of the Earth in km
    const r_earth = 6378.137;

    // Google maps object
    let map;

    // Streetview object
    let panorama;

    // Distance to teleport
    let teleportDistance = 25;

    // Allowed distances for teleport
    let teleportOptions = [25, 50, 75, 100, 150, 200, 250, 500, 1000];

    /**
     * Make a post request to server.
     *
     * @param {string} API endpoint to make post requst to
     * @param {Object} Data to send along with request
     * @return {Promise<Object>}
     */
    function postApi(endpoint, data = {}) {
        if (!endpoint.startsWith("http")) {
            endpoint = `${URL}${endpoint}`;
        }

        return new Promise((resolve, reject) =>{
            const xhr = new XMLHttpRequest();

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const response = JSON.parse(xhr.responseText)
                    resolve(response);
                }
            };

            xhr.onerror = (ex) => reject(ex);

            xhr.open('POST', endpoint, true)
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.setRequestHeader("Accept","application/json");
            xhr.send(JSON.stringify(data));
        });
    }

    /**
     * Greasemonkey/Tampermonkey version of sending data to API.
     * I've had mixed luck with XMLHttpRequest so keeping this here
     * if needed. If we do use this, @grant GM_xmlhttpRequest and
     * @grant unsafeWindow must be placed in the script headers.
     *
     * @param {string} API endpoint to make post requst to
     * @param {Object} Data to send along with request
     * @return {Promise<Object>}
     */
    function GM_postApi(endpoint, data = {}) {
        if (!endpoint.startsWith("http")) {
            endpoint = `${URL}${endpoint}`;
        }

        return new Promise((resolve, reject) => {
           GM_xmlhttpRequest({
               method: "POST",
               url: endpoint,
               data: JSON.stringify(data),
               onload: (data) => resolve(JSON.parse(data)),
               onerror: (data) => reject(data),
               headers: {
                   "Content-Type": "application/json",
                   "Accept": "application/json"
               }
           });
        });
    }

    /**
     * Loop through all visited points and check if the provided
     * point is within in _distance_ range of those points.
     *
     * @param {number} Latitude
     * @param {number} Longitude
     * @param {number} Distance to check from point
     * @return {boolean} True if provided point is near a point visited
     */
    function checkBoundingBoxIntersection(lat, lng, distance) {
        // Length of 1 meter in degrees = 0.000008983152841195216
        const m = 1 / (((2 * Math.PI) / 360) * r_earth) / 1000;
        const dLat = distance * m;

        for (let position of positionHistory) {
            const dLng = dLat / Math.cos(position.lat * (Math.PI / 180));

            let minLatitude = position.lat - dLat;
            let maxLatitude = position.lat + dLat;
            let minLongitude = position.lng - dLng;
            let maxLongitude = position.lng + dLng;

            if (lat > minLatitude && lat < maxLatitude && lng > minLongitude && lng < maxLongitude) {
                return true;
            }
        }

        return false;
    }


    /**
     * Record current position to database
     *
     * @param {Object} param
     * @param {Position} param.position Current position on map
     * @param {GameData} param.game Data about game. Includes all sorts of neat things.
     */
    async function recordPosition({position, game}) {

        if (Object.keys(game).length <= 0) {
            return;
        }

        const url = `record-location`;

        // Check if server call should even be made
        // by cycling through recorded positions and making
        // sure we haven't recorded a position within a
        // 150 meter bounding box.
        const {lat, lng} = position;
        if (checkBoundingBoxIntersection(lat, lng, 200)) {
            return;
        }
        positionHistory.push({lat, lng});

        try {
            const result = await postApi(url, {
                token: TOKEN,
                type: "travel",
                game: game.token,
                round: game.round,
                map: game.map,
                nick: game.player.nick,
                ...position
            });
        } catch (ex) {
            console.log("error", ex);
        }
    }



    /**
     * Compute new longitude and latitude coordinates given a starting point, distance, and heading
     *
     * @param {LatLng} center Origin point to compute offset from
     * @param {number} distance Distance in meters
     * @param {number} angle Angle in degrees
     * @return {LatLng}
     */
    function calculateNewCoordinates({lat, lng}, distance, heading) {

        // This is effectively the same as:
        // const offset = map.geometry.spherical.computeOffset({lat, lng}, distance, heading);
        // return {lat: offset.lat(), lng: offset.lng()};
        // Honestly, I don't know why I made this (modified from ChatGPT), other than for curiosity.

        // Convert heading from degrees to radians
        heading = (heading * Math.PI) / 180;

        // Convert latitude and longitude from degrees to radians
        lat = (lat * Math.PI) / 180;
        lng = (lng * Math.PI) / 180;

        // Calculate common ratio used in offset calculations
        const ratio = (distance / 1000) / r_earth;

        // Calculate the new latitude
        const newLat = Math.asin(
            Math.sin(lat) * Math.cos(ratio) +
            Math.cos(lat) * Math.sin(ratio) * Math.cos(heading)
        );

        // Calculate the new longitude
        const newLng = lng + Math.atan2(
            Math.sin(heading) * Math.sin(ratio) * Math.cos(lat),
            Math.cos(ratio) - Math.sin(lat) * Math.sin(newLat)
        );

        // Return data, converting back to degrees
        return {
            lat: (newLat * 180) / Math.PI,
            lng: (newLng * 180) / Math.PI
        };
    }

    /**
     * Teleport to new position
     * TODO: What happens if there is nothing to teleport to?
     *
     * @param {Number} How far to teleport
     * @param {Boolean} Whether to move backwards or not. Default forward.
     */
    function teleport(distance, backwards = false) {
        const lat = panorama.getPosition().lat();
        const lng = panorama.getPosition().lng();
        let { heading, pitch } = panorama.getPov();

        let offsetHeading = heading;
        if (backwards) {
            offsetHeading = (heading + 180) % 360;
        }

        const location = calculateNewCoordinates({lat, lng}, distance, offsetHeading);

        const svService = new map.StreetViewService();
        svService.getPanorama({ location, radius: 1000, preference: "nearest"}, function (data, status) {
            panorama.setPosition(data.location.latLng);
            panorama.setPov({heading, pitch});
        });
    }

    /**
     * Setup hot keys an associated event handlers
     */
    function setupHotkeys() {
        const handlers = {
            "KeyF": () => teleport(teleportDistance),
            "KeyB": () => teleport(teleportDistance, true),
            "KeyV": () => teleport(teleportDistance, true),
            "PageUp": () => increaseTeleport(),
            "PageDown": () => decreaseTeleport()
        };

        document.addEventListener("keyup", (event) => {
            if (!geoguessr.isGamePage() || !map) {
                return;
            }

            if (Object.keys(handlers).indexOf(event.code) >= 0) {
                event.preventDefault();
                event.stopPropagation();
                handlers[event.code]();
            }
        });
    }

    /**
     * Toggle the UI off
     */
    function hideUi() {
        let dom = document.getElementById("zzyzx-ui");
        if (dom) {
            dom.style.visibility = "hidden";
        }
    }

    /**
     * Toggle the UI onn
     */
    function showUi() {
        let dom = document.getElementById("zzyzx-ui");
        if (dom) {
            dom.style.visibility = "";
        }
    }

    /**
     * Set up the UI
     */
    function setupUi() {
        if (document.getElementById("zzyzx-ui")) {
            return;
        }

        const ui = document.createElement("DIV");
        ui.style.visibility = "hidden";
        ui.style.position = "fixed";
        ui.style.top = "3em";
        ui.style.left = "1em";
        ui.style.zIndex = "99999";
        ui.style.fontSize = "16px";
        ui.style.display = "block";
        ui.style.width = "300px";
        ui.id = "zzyzx-ui";

        const div = document.createElement("DIV");
        div.innerText = "Teleport Distance: " + teleportDistance + " m";
        div.style.position = "absolute";
        div.style.top = "0";
        div.style.color = "white";
        div.id = "zzyzx-teleport-label";

        ui.appendChild(div);
        document.body.appendChild(ui);
    }

    /**
     * Draw teleport distance
     */
    function drawTeleport() {
        const dom = document.getElementById("zzyzx-teleport-label");
        if (dom) {
            dom.innerText = "Teleport Distance: " + teleportDistance + " m";
        }
    }

    /**
     * Event handler for increasing the teleport distance
     */
    function increaseTeleport() {
        let index = teleportOptions.indexOf(teleportDistance);
        if (index >= teleportOptions.length - 1) {
            index = teleportOptions.length - 1;
        } else {
            index++;
        }

        teleportDistance = teleportOptions[index];
        drawTeleport();
    }

    /**
     * Event handler for decreasing the teleport distance
     */
    function decreaseTeleport() {
        let index = teleportOptions.indexOf(teleportDistance);
        if (index <= 0) {
            index = 0;
        } else {
            index--;
        }

        teleportDistance = teleportOptions[index];
        drawTeleport();
    }

    const geoguessr = new Geoguessr();
    geoguessr.on("ready", (obj) => {
        map = obj.map;
        panorama = obj.panorama;
        setupHotkeys();
        setupUi();
    });
    geoguessr.on("position-changed", recordPosition);
    geoguessr.on("round-end", (obj) => {hideUi(); console.log("Round ended", obj)});
    geoguessr.on("round-start", (obj) => {showUi(); console.log("Round started", obj)});
    geoguessr.on("game-end", () => console.log("Game ended"));
})();
