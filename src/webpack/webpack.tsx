/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { proxyLazy } from "@utils/lazy";
import { LazyComponent } from "@utils/lazyReact";
import { Logger } from "@utils/Logger";
import { canonicalizeMatch } from "@utils/patches";
import { proxyInner } from "@utils/proxyInner";
import { NoopComponent } from "@utils/react";
import type { WebpackInstance } from "discord-types/other";

import { traceFunction } from "../debug/Tracer";

const logger = new Logger("Webpack");

export let _resolveReady: () => void;
/**
 * Fired once a gateway connection to Discord has been established.
 * This indicates that the core webpack modules have been initialised
 */
export const onceReady = new Promise<void>(r => _resolveReady = r);

export let wreq: WebpackInstance;
export let cache: WebpackInstance["c"];

export type FilterFn = (mod: any) => boolean;

export const filters = {
    byProps: (...props: string[]): FilterFn => {
        const filter = props.length === 1
            ? m => m?.[props[0]] !== void 0
            : m => props.every(p => m?.[p] !== void 0);

        // @ts-ignore
        filter.$$vencordProps = props;
        return filter;
    },

    byCode: (...code: string[]): FilterFn => {
        const filter = m => {
            if (typeof m !== "function") return false;
            const s = Function.prototype.toString.call(m);
            for (const c of code) {
                if (!s.includes(c)) return false;
            }
            return true;
        };

        filter.$$vencordProps = code;
        return filter;
    },

    byStoreName: (name: string): FilterFn => {
        const filter = m => m?.constructor?.displayName === name;

        filter.$$vencordProps = [name];
        return filter;
    },

    componentByCode: (...code: string[]): FilterFn => {
        const filter = filters.byCode(...code);
        const wrapper = m => {
            if (filter(m)) return true;
            if (!m?.$$typeof) return false;
            if (m?.type && m.type.render) return filter(m.type.render); // memo + forwardRef
            if (m?.type) return filter(m.type); // memos
            if (m?.render) return filter(m.render); // forwardRefs
            return false;
        };

        wrapper.$$vencordProps = code;
        return wrapper;
    }
};

export type ModCallbackFn = (mod: any) => void;
export type ModCallbackFnWithId = (mod: any, id: string) => void;

export const waitForSubscriptions = new Map<FilterFn, ModCallbackFn>();
export const listeners = new Set<ModCallbackFnWithId>();

export function _initWebpack(instance: typeof window.webpackChunkdiscord_app) {
    if (cache !== void 0) throw "no.";

    instance.push([[Symbol("Vencord")], {}, r => wreq = r]);
    instance.pop();
    if (!wreq) return false;

    cache = wreq.c;
    return true;
}

let devToolsOpen = false;
if (IS_DEV && IS_DISCORD_DESKTOP) {
    // At this point in time, DiscordNative has not been exposed yet, so setImmediate is needed
    setTimeout(() => {
        DiscordNative/* just to make sure */?.window.setDevtoolsCallbacks(() => devToolsOpen = true, () => devToolsOpen = false);
    }, 0);
}

export const lazyWebpackSearchHistory = [] as Array<["find" | "findByProps" | "findByCode" | "findStore" | "findComponent" | "findComponentByCode" | "findExportedComponent" | "waitFor" | "waitForComponent" | "waitForExportedComponent" | "waitForComponentByCode" | "waitForProps" | "waitForCode" | "waitForStore" | "proxyLazyWebpack" | "LazyComponentWebpack" | "extractAndLoadChunks", any[]]>;

function handleModuleNotFound(method: string, ...filter: unknown[]) {
    const err = new Error(`webpack.${method} found no module`);
    logger.error(err, "Filter:", filter);

    // Strict behaviour in DevBuilds to fail early and make sure the issue is found
    if (IS_DEV && !devToolsOpen)
        throw err;
}

/**
 * Find the first module that matches the filter
 */
export const find = traceFunction("find", function find(filter: FilterFn, { isIndirect = false }: { isIndirect?: boolean; } = {}) {
    if (typeof filter !== "function")
        throw new Error("Invalid filter. Expected a function got " + typeof filter);

    for (const key in cache) {
        const mod = cache[key];
        if (!mod?.exports) continue;

        if (filter(mod.exports)) {
            return mod.exports;
        }

        if (mod.exports.default && filter(mod.exports.default)) {
            const found = mod.exports.default;
            return found;
        }
    }

    if (!isIndirect) {
        handleModuleNotFound("find", filter);
    }

    return null;
});


/**
 * Wait for a module that matches the provided filter to be required,
 * then call the callback with the module as the first argument
 */
export function waitFor(filter: FilterFn, callback: ModCallbackFn, { isIndirect = false }: { isIndirect?: boolean; } = {}) {
    if (IS_DEV && !isIndirect) lazyWebpackSearchHistory.push(["waitFor", [filter]]);

    if (cache != null) {
        const existing = find(filter, { isIndirect: true });
        if (existing) return callback(existing);
    }

    waitForSubscriptions.set(filter, callback);
}

/**
 * Wait for a component that matches the provided filter to be required
 * and modify the inner noop component to be the found component
 * @returns A component to render both the real and the noop component, if the filter did not have a match
 */
export function waitForComponent<T extends React.ComponentType<any> = React.ComponentType<any>>(filter: FilterFn, parse: (component: any) => T = m => m, { isIndirect = false }: { isIndirect?: boolean; } = {}) {
    if (IS_DEV && !isIndirect) lazyWebpackSearchHistory.push(["waitForComponent", [filter]]);

    let InnerComponent = NoopComponent as any as T;

    const LazyComponent = (props: any) => {
        return <InnerComponent {...props} />;
    };

    LazyComponent.$$vencordGetter = () => InnerComponent;

    waitFor(filter, (v: any) => {
        const parsedComponent = parse(v);
        InnerComponent = parsedComponent;
        Object.assign(InnerComponent, parsedComponent);
    }, { isIndirect: true });

    return LazyComponent as any as T;
}

/**
 * Wait for a component that is exported by the first prop name to be required
 * and assign the inner noop component to the found component
 * @returns A component to render both the real and the noop component, if the filter did not have a match
 */
export function waitForExportedComponent<T extends React.ComponentType<any> = React.ComponentType<any>>(...props: string[]) {
    if (IS_DEV) lazyWebpackSearchHistory.push(["waitForExportedComponent", props]);

    let InnerComponent = NoopComponent as any as T;

    const LazyComponent = (props: any) => {
        return <InnerComponent {...props} />;
    };

    LazyComponent.$$vencordGetter = () => InnerComponent;

    waitFor(filters.byProps(...props), (v: any) => {
        InnerComponent = v[props[0]];
        Object.assign(InnerComponent, v[props[0]]);
    }, { isIndirect: true });

    return LazyComponent as any as T;
}

/**
 * Wait for a component that is includes the given code to be required
 * and assign the inner noop component to the found component
 * @returns A component to render both the real and the noop component, if the filter did not have a match
 */
export function waitForComponentByCode<T extends React.ComponentType<any> = React.ComponentType<any>>(...code: string[]) {
    if (IS_DEV) lazyWebpackSearchHistory.push(["waitForComponentByCode", code]);

    return waitForComponent<T>(filters.componentByCode(...code), m => m, { isIndirect: true });
}

/**
 * Wait for a module that matches the provided filter to be required,
 * then call the callback with the module as the first argument.
 *
 * If no callback is specified, the default callback will assign the proxy inner value to all the module
 * The callback must return a value that will be used as the proxy inner value.
 * @returns A proxy that has the callback return value as its true value
 */
export function waitForLazy<T = any>(filter: FilterFn, callback: (mod: any) => any = m => m, { isIndirect = false }: { isIndirect?: boolean; } = {}) {
    const [proxy, setInnerValue] = proxyInner<T>();

    waitFor(filter, mod => setInnerValue(callback(mod)), { isIndirect });

    return proxy;
}

/**
 * Wait for a module that includes the given props to be required
 * and assign the inner value to it
 * @returns A proxy that has the found module as its true value
 */
export function waitForPropsLazy<T = any>(...props: string[]) {
    if (IS_DEV) lazyWebpackSearchHistory.push(["waitForProps", props]);

    return waitForLazy<T>(filters.byProps(...props), m => m, { isIndirect: true });
}

/**
 * Wait for a module that includes the given code to be required
 * and assign the inner value to it
 * @returns A proxy that has the found module as its true value
 */
export function waitForCodeLazy<T = any>(...code: string[]) {
    if (IS_DEV) lazyWebpackSearchHistory.push(["waitForCode", code]);

    return waitForLazy<T>(filters.byCode(...code), m => m, { isIndirect: true });
}

/**
 * Wait for a store which has the given name to be required,
 * and assign the inner value to it
 * @returns A proxy that has the found store as its true value
 */
export function waitForStoreLazy<T = any>(name: string) {
    if (IS_DEV) lazyWebpackSearchHistory.push(["waitForStore", [name]]);

    return waitForLazy<T>(filters.byStoreName(name), m => m, { isIndirect: true });
}

export function findAll(filter: FilterFn) {
    if (typeof filter !== "function")
        throw new Error("Invalid filter. Expected a function got " + typeof filter);

    const ret = [] as any[];
    for (const key in cache) {
        const mod = cache[key];
        if (!mod?.exports) continue;

        if (filter(mod.exports))
            ret.push(mod.exports);

        if (mod.exports.default && filter(mod.exports.default))
            ret.push(mod.exports.default);
    }

    return ret;
}

/**
 * Same as {@link find} but in bulk
 * @param filterFns Array of filters. Please note that this array will be modified in place, so if you still
 *                need it afterwards, pass a copy.
 * @returns Array of results in the same order as the passed filters
 */
export const findBulk = traceFunction("findBulk", function findBulk(...filterFns: FilterFn[]) {
    if (!Array.isArray(filterFns))
        throw new Error("Invalid filters. Expected function[] got " + typeof filterFns);

    const { length } = filterFns;

    if (length === 0)
        throw new Error("Expected at least two filters.");

    if (length === 1) {
        if (IS_DEV) {
            throw new Error("bulk called with only one filter. Use find");
        }
        return find(filterFns[0]);
    }

    const filters = filterFns as Array<FilterFn | undefined>;

    let found = 0;
    const results = Array(length);

    outer:
    for (const key in cache) {
        const mod = cache[key];
        if (!mod?.exports) continue;

        for (let j = 0; j < length; j++) {
            const filter = filters[j];
            // Already done
            if (filter === undefined) continue;

            if (filter(mod.exports)) {
                results[j] = mod.exports;
                filters[j] = undefined;
                if (++found === length) break outer;
                break;
            }

            if (mod.exports.default && filter(mod.exports.default)) {
                results[j] = mod.exports.default;
                filters[j] = undefined;
                if (++found === length) break outer;
                break;
            }
        }
    }

    if (found !== length) {
        const err = new Error(`Got ${length} filters, but only found ${found} modules!`);
        if (IS_DEV) {
            if (!devToolsOpen)
                // Strict behaviour in DevBuilds to fail early and make sure the issue is found
                throw err;
        } else {
            logger.warn(err);
        }
    }

    return results;
});

/**
 * Find the id of the first module factory that includes all the given code
 * @returns string or null
 */
export const findModuleId = traceFunction("findModuleId", function findModuleId(...code: string[]) {
    outer:
    for (const id in wreq.m) {
        const str = wreq.m[id].toString();

        for (const c of code) {
            if (!str.includes(c)) continue outer;
        }
        return id;
    }

    const err = new Error("Didn't find module with code(s):\n" + code.join("\n"));
    if (IS_DEV) {
        if (!devToolsOpen)
            // Strict behaviour in DevBuilds to fail early and make sure the issue is found
            throw err;
    } else {
        logger.warn(err);
    }

    return null;
});

/**
 * Find the first module factory that includes all the given code
 * @returns The module factory or null
 */
export function findModuleFactory(...code: string[]) {
    const id = findModuleId(...code);
    if (!id) return null;

    return wreq.m[id];
}

/**
 * This is just a wrapper around {@link proxyLazy} to make our reporter test for your webpack finds.
 *
 * Wraps the result of {@link makeLazy} in a Proxy you can consume as if it wasn't lazy.
 * On first property access, the lazy is evaluated
 * @param factory lazy factory
 * @param attempts how many times to try to evaluate the lazy before giving up
 * @returns Proxy
 *
 * Note that the example below exists already as an api, see {@link waitForPropsLazy}
 * @example const mod = proxyLazy(() => findByProps("blah")); console.log(mod.blah);
 */
export function proxyLazyWebpack<T = any>(factory: () => any, attempts?: number) {
    if (IS_DEV) lazyWebpackSearchHistory.push(["proxyLazyWebpack", [factory]]);

    return proxyLazy<T>(factory, attempts);
}

/**
 * This is just a wrapper around {@link LazyComponent} to make our reporter test for your webpack finds.
 *
 * A lazy component. The factory method is called on first render.
 * @param factory Function returning a Component
 * @param attempts How many times to try to get the component before giving up
 * @returns Result of factory function
 */
export function LazyComponentWebpack<T extends object = any>(factory: () => any, attempts?: number) {
    if (IS_DEV) lazyWebpackSearchHistory.push(["LazyComponentWebpack", [factory]]);

    return LazyComponent<T>(factory, attempts);
}

/**
 * Find the first module that matches the filter, lazily
 */
export function findLazy(filter: FilterFn) {
    if (IS_DEV) lazyWebpackSearchHistory.push(["find", [filter]]);

    return proxyLazy(() => find(filter));
}

/**
 * Find the first module that has the specified properties
 */
export function findByProps(...props: string[]) {
    const res = find(filters.byProps(...props), { isIndirect: true });
    if (!res)
        handleModuleNotFound("findByProps", ...props);
    return res;
}

/**
 * Find the first module that has the specified properties, lazily
 */
export function findByPropsLazy(...props: string[]) {
    if (IS_DEV) lazyWebpackSearchHistory.push(["findByProps", props]);

    return proxyLazy(() => findByProps(...props));
}

/**
 * Find the first function that includes all the given code
 */
export function findByCode(...code: string[]) {
    const res = find(filters.byCode(...code), { isIndirect: true });
    if (!res)
        handleModuleNotFound("findByCode", ...code);
    return res;
}

/**
 * Find the first function that includes all the given code, lazily
 */
export function findByCodeLazy(...code: string[]) {
    if (IS_DEV) lazyWebpackSearchHistory.push(["findByCode", code]);

    return proxyLazy(() => findByCode(...code));
}

/**
 * Find a store by its displayName
 */
export function findStore(name: string) {
    const res = find(filters.byStoreName(name), { isIndirect: true });
    if (!res)
        handleModuleNotFound("findStore", name);
    return res;
}

/**
 * Find a store by its displayName, lazily
 */
export function findStoreLazy(name: string) {
    if (IS_DEV) lazyWebpackSearchHistory.push(["findStore", [name]]);

    return proxyLazy(() => findStore(name));
}

/**
 * Finds the component which includes all the given code. Checks for plain components, memos and forwardRefs
 */
export function findComponentByCode(...code: string[]) {
    const res = find(filters.componentByCode(...code), { isIndirect: true });
    if (!res)
        handleModuleNotFound("findComponentByCode", ...code);
    return res;
}

/**
 * Finds the first component that matches the filter, lazily.
 */
export function findComponentLazy<T extends object = any>(filter: FilterFn) {
    if (IS_DEV) lazyWebpackSearchHistory.push(["findComponent", [filter]]);


    return LazyComponent<T>(() => {
        const res = find(filter, { isIndirect: true });
        if (!res)
            handleModuleNotFound("findComponent", filter);
        return res;
    });
}

/**
 * Finds the first component that includes all the given code, lazily
 */
export function findComponentByCodeLazy<T extends object = any>(...code: string[]) {
    if (IS_DEV) lazyWebpackSearchHistory.push(["findComponentByCode", code]);

    return LazyComponent<T>(() => {
        const res = find(filters.componentByCode(...code), { isIndirect: true });
        if (!res)
            handleModuleNotFound("findComponentByCode", ...code);
        return res;
    });
}

/**
 * Finds the first component that is exported by the first prop name, lazily
 */
export function findExportedComponentLazy<T extends object = any>(...props: string[]) {
    if (IS_DEV) lazyWebpackSearchHistory.push(["findExportedComponent", props]);

    return LazyComponent<T>(() => {
        const res = find(filters.byProps(...props), { isIndirect: true });
        if (!res)
            handleModuleNotFound("findExportedComponent", ...props);
        return res[props[0]];
    });
}

/**
 * Extract and load chunks using their entry point
 * @param code An array of all the code the module factory containing the entry point (as of using it to load chunks) must include
 * @param matcher A RegExp that returns the entry point id as the first capture group. Defaults to a matcher that captures the first entry point found in the module factory
 */
export async function extractAndLoadChunks(code: string[], matcher: RegExp = /\.el\("(.+?)"\)(?<=(\i)\.el.+?)\.then\(\2\.bind\(\2,"\1"\)\)/) {
    const module = findModuleFactory(...code);
    if (!module) {
        const err = new Error("extractAndLoadChunks: Couldn't find module factory");
        logger.warn(err, "Code:", code, "Matcher:", matcher);

        return;
    }

    const match = module.toString().match(canonicalizeMatch(matcher));
    if (!match) {
        const err = new Error("extractAndLoadChunks: Couldn't find entry point id in module factory code");
        logger.warn(err, "Code:", code, "Matcher:", matcher);

        // Strict behaviour in DevBuilds to fail early and make sure the issue is found
        if (IS_DEV && !devToolsOpen)
            throw err;

        return;
    }

    const [, id] = match;
    if (!id || !Number(id)) {
        const err = new Error("extractAndLoadChunks: Matcher didn't return a capturing group with the entry point, or the entry point returned wasn't a number");
        logger.warn(err, "Code:", code, "Matcher:", matcher);

        // Strict behaviour in DevBuilds to fail early and make sure the issue is found
        if (IS_DEV && !devToolsOpen)
            throw err;

        return;
    }

    await (wreq as any).el(id);
    return wreq(id as any);
}

/**
 * This is just a wrapper around {@link extractAndLoadChunks} to make our reporter test for your webpack finds.
 *
 * Extract and load chunks using their entry point
 * @param code An array of all the code the module factory containing the entry point (as of using it to load chunks) must include
 * @param matcher A RegExp that returns the entry point id as the first capture group. Defaults to a matcher that captures the first entry point found in the module factory
 * @returns A function that loads the chunks on first call
 */
export function extractAndLoadChunksLazy(code: string[], matcher: RegExp = /\.el\("(.+?)"\)(?<=(\i)\.el.+?)\.then\(\2\.bind\(\2,"\1"\)\)/) {
    if (IS_DEV) lazyWebpackSearchHistory.push(["extractAndLoadChunks", [code, matcher]]);

    return () => extractAndLoadChunks(code, matcher);
}

/**
 * Search modules by keyword. This searches the factory methods,
 * meaning you can search all sorts of things, displayName, methodName, strings somewhere in the code, etc
 * @param filters One or more strings or regexes
 * @returns Mapping of found modules
 */
export function search(...filters: Array<string | RegExp>) {
    const results = {} as Record<number, Function>;
    const factories = wreq.m;
    outer:
    for (const id in factories) {
        const factory = factories[id].original ?? factories[id];
        const str: string = factory.toString();
        for (const filter of filters) {
            if (typeof filter === "string" && !str.includes(filter)) continue outer;
            if (filter instanceof RegExp && !filter.test(str)) continue outer;
        }
        results[id] = factory;
    }

    return results;
}

/**
 * Extract a specific module by id into its own Source File. This has no effect on
 * the code, it is only useful to be able to look at a specific module without having
 * to view a massive file. extract then returns the extracted module so you can jump to it.
 * As mentioned above, note that this extracted module is not actually used,
 * so putting breakpoints or similar will have no effect.
 * @param id The id of the module to extract
 */
export function extract(id: string | number) {
    const mod = wreq.m[id] as Function;
    if (!mod) return null;

    const code = `
// [EXTRACTED] WebpackModule${id}
// WARNING: This module was extracted to be more easily readable.
//          This module is NOT ACTUALLY USED! This means putting breakpoints will have NO EFFECT!!

0,${mod.toString()}
//# sourceURL=ExtractedWebpackModule${id}
`;
    const extracted = (0, eval)(code);
    return extracted as Function;
}
