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

function GeoguessrEvents() {
    let roundNumber = 0;
    let events = {};
    let map = null;

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
        } else if (node.classList.contains("guess-map")) {
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
	};
}

(function() {
    // Change host to wherever server is running.
    // Usually http://127.0.0.1:8787/api/ for local servers
    // Usually https://geoguessr.zyzzx.workers.dev/api for remote
    const host = "http://127.0.0.1:8787/api/";

    /**
     * @type {Object|null}
     * Google Maps API object
     */
    let maps;

    /**
     * @type {{lng: number, lat: number}[]}
     * Log of locations that were recorded
     */
    const positionHistory = [];

    // Radius of the Earth in km
    const r_earth = 6378.137;

    /**
     * Make a post request to server.
     * This function uses GM_xmlhttpRequest so it will require the user
     * to accept calls to the remote server.
     *
     * @param {string} URL to make post requst to
     * @param {Object} Data to send along with request
     * @return {Promise<Object>}
     */
    function post(url, data = {}) {
        return new Promise((resolve, reject) =>{
            const xhr = new XMLHttpRequest();

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const response = JSON.parse(xhr.responseText)
                    resolve(response);
                }
            };

            xhr.onerror = (ex) => reject(ex);

            xhr.open('POST', url, true)
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.setRequestHeader("Accept","application/json");
            xhr.send(JSON.stringify(data));
        });
    }

    /**
     * Get the current GeoGuessr user
     *
     * @return {Object|null}
     */
    function getUser() {
        let data = document.getElementById("__NEXT_DATA__");
        if (data) {
            data = JSON.parse(data.text);
            if (data.props.middlewareResults) {
                const mw = data.props.middlewareResults;
                for (let i = 0; i < mw.length; i++) {
                    if (mw[i] && mw[i].account) {
                        return mw[i].account.user;
                    }
                }
            }
        }

        return null;
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
        const url = `${host}record-position`;
        const user = getUser();

        // Check if server call should even be made
        // by cycling through recorded positions and making
        // sure we haven't recorded a position within a
        // 50 meter bounding box.
        const {lat, lng} = position;
        if (checkBoundingBoxIntersection(lat, lng, 50)) {
            return;
        }

        positionHistory.push({lat, lng});

        const result = await post(url, {
            userId: user.userId,
            nick: user.nick,
            ...position
        });

        console.log(result);
    }

    const geoguessr = GeoguessrEvents();
    geoguessr.on("position-changed", (obj) => recordPosition(obj));
    geoguessr.on("round-ended", (obj) => console.log("Round ended", obj));
    geoguessr.on("round-started", (obj) => console.log("Round started", obj));
    geoguessr.on("game-ended", () => console.log("Game ended"));
})();
