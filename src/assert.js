import {isConsole} from "../config"

export function assert(condition, message = false) {
    if (!condition) {
        if (isConsole) {
            // bun ignores the 'debugger' keyword and continues execution
            // so make sure assert failures are caught during the tests
            throw new Error("ASSERT: " + message)
        }
        console.trace()
        console.error("ASSERT: " + message);
        debugger;
    }
}