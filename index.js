// ==UserScript==
// @name         GeoGuessr Recorder
// @namespace    theyak
// @version      0.1
// @description  Record positions visited in GeoGuessr
// @author       theyak
// @match        https://www.geoguessr.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

// TODO:
// * Come up with a way to view location data
// * Come up with a way to make a private api key
// * Add move forward/backward keys that can be used with dynamic distance
// * Figure out what to do if teleport fails

// Change host to wherever server is running.
// Usually http://127.0.0.1:8787/api/ for local servers
// Usually https://geoguessr.zyzzx.workers.dev/api for remote
const URL = "https://127.0.0.1:8787/";

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

    // Doesn't work well for streaks.
    function getRound() {
        const roundData = document.querySelector("div[data-qa='round-number']");
        if (roundData) {
            let roundElement = roundData.querySelector("div:last-child");
            if (roundElement) {
                let round = parseInt(roundElement.innerText.charAt(0));
                if (!isNaN(round) && round >= 1 && round <= 5) {
                    return round;
                }
            }
        }
        return null;
    }

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
     * Fetch the game data at time of load.
     * This is basically the data the GeoGuessr app gets on page load.
     *
     * @return {Object} gameData
     * @return {Object} gameData.map
     * @return {Object} gameData.game
     * @return {Object} gameData.player
     */
    function getGameData() {
        const dom = document.getElementById("__NEXT_DATA__");
        if (!dom) {
            return null;
        }

        const data = JSON.parse(dom.innerText);
        const map = data.props.pageProps.map;
        const game = {...data.props.pageProps.game};
        const player = data.props.pageProps.game.player;
        delete game.player;

        return {
            map,
            game,
            player
        };
    }

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
            emit("round-ended", {round: roundNumber});

            // streaks/quick play
            if (document.querySelector('[data-qa="play-again-button"]')) {
                emit("game-ended");
            }

            roundNumber = 0;
        } else if (node.className.startsWith("standard-final-result_wrapper")) {
            // Classic/explorer
            emit("game-ended");
        } else if (node.querySelector('[data-qa="pano-zoom-in"]')) {
            if (getRound() !== roundNumber) {
                roundNumber = getRound();
                emit("round-started", {round: roundNumber});
            }
        }
    }

    function setupMutationObserver() {
        const observer = new MutationObserver((mutations) => {
            const win = window || unsafeWindow;
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
                        const { heading, pitch } = this.getPov();

                        emit("position-changed", {
                            lat,
                            lng,
                            heading,
                            pitch
                        });
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
        getRound,
        getGameData,
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

    // Current position on map
    let position;

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
            endpoint = `${URL}$endpoint`;
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
        const degrees = distance * m;

        let found = false;
        for (let position of positionHistory) {

            const dLat = degrees / Math.cos(position.lat * (Math.PI / 180));

            let minLatitude = position.lat - degrees;
            let maxLatitude = position.lat + degrees;
            let minLongitude = position.lng - dLat;
            let maxLongitude = position.lng + dLat;

            if (lat > minLatitude && lat < maxLatitude && lng > minLongitude && lng < maxLongitude) {
                return true;
            }
        }

        return false;
    }


    /**
     * Record current position to database
     *
     * @param {Object} position Position to record
     * @param {number} position.lng Current longitude position on map
     * @param {number} position.lat Current latitude position on map
     * @param {number} position.heading Direction facing on map
     * @param {number} position.pitch The pitch on the map. Negative means facing down, positive means facing up
     */
    async function recordPosition(position) {
        const url = `record-position`;
        const user = geoguessr.getGameData().player;

        // Check if server call should even be made
        // by cycling through recorded positions and making
        // sure we haven't recorded a position within a
        // 50 meter bounding box.
        const {lat, lng} = position;
        if (checkBoundingBoxIntersection(lat, lng, 50)) {
            return;
        }

        try {
            const result = await postApi(url, {
                userId: user.id,
                nick: user.nick,
                ...position
            });
            console.log(result);
        } catch (ex) {
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


    function setPosition(data) {
        position = data;
        positionHistory.push(position);
        // recordPosition(position);
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
    geoguessr.on("position-changed", setPosition);
    geoguessr.on("round-ended", (obj) => {hideUi(); console.log("Round ended", obj)});
    geoguessr.on("round-started", (obj) => {showUi(); console.log("Round started", obj)});
    geoguessr.on("game-ended", () => console.log("Game ended"));
})();
