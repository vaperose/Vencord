/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
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

import type { Channel, User } from "discord-types/general";

// eslint-disable-next-line path-alias/no-relative
import { _resolveReady, filters, waitFor, waitForCodeLazy, waitForLazy, waitForPropsLazy } from "../webpack";
import type * as t from "./types/utils";

export const FluxDispatcher = waitForLazy<t.FluxDispatcher>(filters.byProps("dispatch", "subscribe"), m => {
    const cb = () => {
        m.unsubscribe("CONNECTION_OPEN", cb);
        _resolveReady();
    };
    m.subscribe("CONNECTION_OPEN", cb);

    return m;
});

export const { ComponentDispatch } = waitForPropsLazy("ComponentDispatch", "ComponentDispatcher");

export const RestAPI = waitForPropsLazy<t.RestAPI>("getAPIBaseURL", "get");
export const moment = waitForPropsLazy<typeof import("moment")>("parseTwoDigitYear");

export const hljs = waitForPropsLazy<typeof import("highlight.js")>("highlight", "registerLanguage");

export const lodash = waitForPropsLazy<typeof import("lodash")>("debounce", "cloneDeep");

export const i18n = waitForLazy<t.i18n>(m => m.Messages?.["en-US"]);

export const SnowflakeUtils = waitForPropsLazy<t.SnowflakeUtils>("fromTimestamp", "extractTimestamp");

export const Parser = waitForPropsLazy<t.Parser>("parseTopic");
export const Alerts = waitForPropsLazy<t.Alerts>("show", "close");

const ToastType = {
    MESSAGE: 0,
    SUCCESS: 1,
    FAILURE: 2,
    CUSTOM: 3
};
const ToastPosition = {
    TOP: 0,
    BOTTOM: 1
};

export const Toasts = {
    Type: ToastType,
    Position: ToastPosition,
    // what's less likely than getting 0 from Math.random()? Getting it twice in a row
    genId: () => (Math.random() || Math.random()).toString(36).slice(2),

    // hack to merge with the following interface, dunno if there's a better way
    ...{} as {
        show(data: {
            message: string,
            id: string,
            /**
             * Toasts.Type
             */
            type: number,
            options?: {
                /**
                 * Toasts.Position
                 */
                position?: number;
                component?: React.ReactNode,
                duration?: number;
            };
        }): void;
        pop(): void;
    }
};

// This is the same module but this is easier
waitFor(filters.byCode("showToast"), m => {
    Toasts.show = m.showToast;
    Toasts.pop = m.popToast;
});

/**
 * Show a simple toast. If you need more options, use Toasts.show manually
 */
export function showToast(message: string, type = ToastType.MESSAGE) {
    Toasts.show({
        id: Toasts.genId(),
        message,
        type
    });
}

export const UserUtils = waitForPropsLazy("getUser", "fetchCurrentUser") as { getUser: (id: string) => Promise<User>; };
export const UploadHandler = waitForPropsLazy("showUploadFileSizeExceededError", "promptToUpload") as {
    promptToUpload: (files: File[], channel: Channel, draftType: Number) => void;
};

export const ApplicationAssetUtils = waitForPropsLazy("fetchAssetIds", "getAssetImage") as {
    fetchAssetIds: (applicationId: string, e: string[]) => Promise<string[]>;
};

export const Clipboard = waitForPropsLazy<t.Clipboard>("SUPPORTS_COPY", "copy");

export const NavigationRouter = waitForPropsLazy<t.NavigationRouter>("transitionTo", "replaceWith", "transitionToGuild");

export const SettingsRouter = waitForPropsLazy("open", "saveAccountChanges");

export const { Permissions: PermissionsBits } = waitForLazy(m => typeof m.Permissions?.ADMINISTRATOR === "bigint") as { Permissions: t.PermissionsBits; };

export const zustandCreate = waitForCodeLazy<typeof import("zustand").default>("will be removed in v4");

const persistFilter = filters.byCode("[zustand persist middleware]");
export const { persist: zustandPersist } = waitForLazy<typeof import("zustand/middleware")>(m => m.persist && persistFilter(m.persist));

export const MessageActions = waitForPropsLazy("editMessage", "sendMessage");
export const UserProfileActions = waitForPropsLazy("openUserProfileModal", "closeUserProfileModal");
export const InviteActions = waitForPropsLazy("resolveInvite");

export const IconUtils = waitForPropsLazy<t.IconUtils>("getGuildBannerURL", "getUserAvatarURL");
