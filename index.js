// ==UserScript==
// @name         GeoGuessr Recorder
// @namespace    theyak
// @version      0.1
// @description  Record positions visited in GeoGuessr
// @author       theyak
// @match        https://www.geoguessr.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

// TODO:
// * Inject PlanetScale HTTP API script
// * Track locations visited
// * Track last recorded location
// * Add distance check to only record when xxx meters from last recorded position
// * Record position
// * Come up with a way to view location data

(function() {
    /**
     * @type {Object|null}
     * Google Maps API object
     */
    let maps;

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
     * Record current position to database
     *
     * @param {number} lat Current latitude position on map
     * @param {number} lng Current longitude position on map
     * @param {number} heading Direction facing on map
     * @param {number} pitch The pitch on the map. Negative means facing down, positive means facing up
     */
    function recordPosition(lat, lng, heading, pitch) {
        console.log("TODO Record", arguments);

        const user = getUser();
        if (user) {
            console.log(user.userId, user.nick);
        }
    }

    /**
     * Function to run when Google Maps has loaded.
     * For our purposes, we add a listener to the panorama service
     * to keep watch of our current position
     *
     * @param {Object} google The Google API that was loaded. Should have a maps object for the Maps API.
     */
    function onGoogleMapsLoaded(google) {
        maps = google.maps;

        // Main StreetViewService object. We don't use it in this script but keeping for documentation purposes.
        const svService = new google.maps.StreetViewService();

        google.maps.StreetViewPanorama = class extends google.maps.StreetViewPanorama {
            constructor(...args) {
                super(...args);

                this.addListener('position_changed', () => {
                    if (!isGamePage) {
                        return;
                    }

                    const lat = this.getPosition().lat();
                    const lng = this.getPosition().lng();
                    const { heading, pitch } = this.getPov();
                    recordPosition(lat, lng, heading, pitch);
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
                    const asScript = newNode
                    if (asScript && asScript.src && asScript.src.startsWith('https://maps.googleapis.com/')) {
                        return asScript
                    }
                }
            }
            return null
        }

        // Get google maps library when GeoGuessr loads it.
        if (document.documentElement) {
            const observer = new MutationObserver((mutations, observer) => {
                const googleScript = getGoogleMapsIfAvailable(mutations);
                if (googleScript) {
                    const oldOnload = googleScript.onload;
                    googleScript.onload = (event) => {
                        if (window.google) {
                            observer.disconnect();
                            callback(window.google);
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
})();
