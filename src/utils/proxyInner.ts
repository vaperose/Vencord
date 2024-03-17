/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const proxyInnerGet = Symbol.for("vencord.proxyInner.get");
export const proxyInnerValue = Symbol.for("vencord.proxyInner.innerValue");

// Proxies demand that these properties be unmodified, so proxyLazy
// will always return the function default for them.
const unconfigurable = ["arguments", "caller", "prototype"];

const handler: ProxyHandler<any> = {
    ...Object.fromEntries(Object.getOwnPropertyNames(Reflect).map(propName =>
        [propName, (target: any, ...args: any[]) => Reflect[propName](target[proxyInnerGet](), ...args)]
    )),
    ownKeys: target => {
        const keys = Reflect.ownKeys(target[proxyInnerGet]());
        for (const key of unconfigurable) {
            if (!keys.includes(key)) keys.push(key);
        }
        return keys;
    },
    getOwnPropertyDescriptor: (target, p) => {
        if (typeof p === "string" && unconfigurable.includes(p))
            return Reflect.getOwnPropertyDescriptor(target, p);

        const descriptor = Reflect.getOwnPropertyDescriptor(target[proxyInnerGet](), p);
        if (descriptor) Object.defineProperty(target, p, descriptor);
        return descriptor;
    }
};

/**
 * A proxy which has an inner value that can be set later.
 * When a property is accessed, the proxy looks for the value in the its inner value, and errors if it's not set.
 * @returns A proxy which will act like the inner value when accessed
 */
export function proxyInner<T = any>(isChild = false): [proxy: T, setInnerValue: (innerValue: T) => void] {
    let isSameTick = true;
    if (!isChild) setTimeout(() => isSameTick = false, 0);

    const proxyDummy = Object.assign(function () { }, {
        [proxyInnerGet]: () => {
            if (proxyDummy[proxyInnerValue] == null) {
                throw new Error("Proxy inner value is undefined, setInnerValue was never called.");
            }

            return proxyDummy[proxyInnerValue];
        },
        [proxyInnerValue]: void 0 as T | undefined
    });

    const recursiveSetInnerValues = [] as Array<(innerValue: T) => void>;

    function setInnerValue(innerValue: T) {
        proxyDummy[proxyInnerValue] = innerValue;
        recursiveSetInnerValues.forEach(setInnerValue => setInnerValue(innerValue));
    }

    return [new Proxy(proxyDummy, {
        ...handler,
        get(target, p, receiver) {
            if (p === proxyInnerValue) return target[proxyInnerValue];
            if (p === proxyInnerGet) return target[proxyInnerGet];

            // if we're still in the same tick, it means the lazy was immediately used.
            // thus, we lazy proxy the get access to make things like destructuring work as expected
            // meow here will also be a lazy
            // `const { meow } = findByPropsLazy("meow");`
            if (!isChild && isSameTick) {
                const [recursiveProxy, recursiveSetInnerValue] = proxyInner(true);
                recursiveSetInnerValues.push((innerValue: T) => {
                    recursiveSetInnerValue(Reflect.get(innerValue as object, p, receiver));
                });

                return recursiveProxy;
            }

            return handler.get?.(target, p, receiver);
        }
    }) as T, setInnerValue];
}
