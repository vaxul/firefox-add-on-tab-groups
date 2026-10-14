// Event page entry. Listeners must be registered synchronously at top level so
// Firefox can wake the page for them; no state is kept between events.
browser.runtime.onInstalled.addListener(() => {
  // Group initialisation arrives with Phase 1.
});
