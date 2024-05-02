/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export function makeLazy<T>(factory: () => T, attempts = 5): () => T {
    let tries = 0;
    let cache: T;
    return () => {
        if (!cache && attempts > tries++) {
            cache = factory();
            if (!cache && attempts === tries)
                console.error("Lazy factory failed:", factory);
        }
        return cache;
    };
}

// Proxies demand that these properties be unmodified, so proxyLazy
// will always return the function default for them.
const unconfigurable = ["arguments", "caller", "prototype"];

const handler: ProxyHandler<any> = {
    ...Object.fromEntries(Object.getOwnPropertyNames(Reflect).map(propName =>
        [propName, (target: any, ...args: any[]) => Reflect[propName](target[kGET](), ...args)]
    )),
    ownKeys: target => {
        const keys = Reflect.ownKeys(target[kGET]());
        for (const key of unconfigurable) {
            if (!keys.includes(key)) keys.push(key);
        }
        return keys;
    },
    getOwnPropertyDescriptor: (target, p) => {
        if (typeof p === "string" && unconfigurable.includes(p))
            return Reflect.getOwnPropertyDescriptor(target, p);

        const descriptor = Reflect.getOwnPropertyDescriptor(target[kGET](), p);
        if (descriptor) Object.defineProperty(target, p, descriptor);
        return descriptor;
    }
};

const kGET = Symbol.for("vencord.lazy.get");
const kCACHE = Symbol.for("vencord.lazy.cached");

/**
 * Wraps the result of {@link makeLazy} in a Proxy you can consume as if it wasn't lazy.
 * On first property access, the lazy is evaluated
 * @param factory lazy factory
 * @param attempts how many times to try to evaluate the lazy before giving up
 * @returns Proxy
 */
export function proxyLazy<T = any>(factory: () => T, attempts = 5, isChild = false): T {
    let isSameTick = true;
    if (!isChild) setTimeout(() => isSameTick = false, 0);

    let tries = 0;
    const proxyDummy = Object.assign(function () { }, {
        [kGET]() {
            if (!proxyDummy[kCACHE] && attempts > tries++) {
                proxyDummy[kCACHE] = factory();
                if (!proxyDummy[kCACHE] && attempts === tries) {
                    throw new Error("Lazy factory failed: " + factory);
                }
            }

            return proxyDummy[kCACHE];
        },
        [kCACHE]: void 0 as T | undefined
    });

    return new Proxy(proxyDummy, {
        ...handler,
        get(target, p, receiver) {
            // if we're still in the same tick, it means the lazy was immediately used.
            // thus, we lazy proxy the get access to make things like destructuring work as expected
            // meow here will also be a lazy
            // `const { meow } = findByPropsLazy("meow");`
            if (!isChild && isSameTick)
                return proxyLazy(
                    () => Reflect.get(target[kGET](), p, receiver),
                    attempts,
                    true
                );
            const lazyTarget = target[kGET]();
            if (typeof lazyTarget === "object" || typeof lazyTarget === "function") {
                return Reflect.get(lazyTarget, p, receiver);
            }
            throw new Error("proxyLazy called on a primitive value");
        }
    }) as T;
}
