// Fake of `browser.runtime`: messaging, onStartup, onInstalled.
import { Dispatcher, FakeEvent } from "./events";

export const EXTENSION_ID = "tab-groups@vaxul.github.io";
const BASE_URL = "moz-extension://00000000-0000-4000-8000-000000000000/";

type Sender = browser.runtime.MessageSender;
type SendResponse = (response: unknown) => void;

/**
 * Firefox semantics: the first listener that returns a promise, or returns
 * `true` and later calls `sendResponse`, answers; without any listener the
 * call rejects.
 */
function deliver(
  listeners: FakeEvent<[unknown, Sender, SendResponse]>,
  message: unknown,
): Promise<unknown> {
  if (listeners.listenerCount === 0) {
    return Promise.reject(
      new Error("Could not establish connection. Receiving end does not exist."),
    );
  }
  return new Promise((resolve, reject) => {
    const sender: Sender = { id: EXTENSION_ID, url: `${BASE_URL}popup.html` };
    let answered = false;
    const answer = (response: unknown) => {
      if (answered) return;
      answered = true;
      resolve(structuredClone(response));
    };
    const results = listeners.collect(message, structuredClone(sender), answer);
    const promise = results.find((r) => r instanceof Promise);
    if (promise) promise.then(answer, reject);
    else if (!results.includes(true)) answer(undefined);
  });
}

export function createRuntimeFake(dispatcher: Dispatcher) {
  const onMessage = new FakeEvent<[unknown, Sender, SendResponse]>(dispatcher);
  const onStartup = new FakeEvent<[]>(dispatcher);
  const onInstalled = new FakeEvent<[browser.runtime._OnInstalledDetails]>(dispatcher);
  return {
    id: EXTENSION_ID,
    onMessage,
    onStartup,
    onInstalled,
    getURL: (path: string) => `${BASE_URL}${path.replace(/^\//, "")}`,
    sendMessage: (message: unknown) => deliver(onMessage, structuredClone(message)),
    reset(): void {
      onMessage.clear();
      onStartup.clear();
      onInstalled.clear();
    },
  };
}

export type FakeRuntime = ReturnType<typeof createRuntimeFake>;
