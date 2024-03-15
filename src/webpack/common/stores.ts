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

import type * as Stores from "discord-types/stores";

// eslint-disable-next-line path-alias/no-relative
import { waitForPropsLazy, waitForStoreLazy } from "../webpack";
import * as t from "./types/stores";

export const Flux: t.Flux = waitForPropsLazy("connectStores");

export type GenericStore = t.FluxStore & Record<string, any>;

export enum DraftType {
    ChannelMessage = 0,
    ThreadSettings = 1,
    FirstThreadMessage = 2,
    ApplicationLauncherCommand = 3
}

export const MessageStore = waitForStoreLazy("MessageStore") as Omit<Stores.MessageStore, "getMessages"> & {
    getMessages(chanId: string): any;
};

// this is not actually a FluxStore
export const PrivateChannelsStore = waitForPropsLazy("openPrivateChannel");
export const PermissionStore: GenericStore = waitForStoreLazy("PermissionStore");
export const GuildChannelStore: GenericStore = waitForStoreLazy("GuildChannelStore");
export const ReadStateStore: GenericStore = waitForStoreLazy("ReadStateStore");
export const PresenceStore: GenericStore = waitForStoreLazy("PresenceStore");

export const GuildStore: t.GuildStore = waitForStoreLazy("GuildStore");
export const UserStore: Stores.UserStore & t.FluxStore = waitForStoreLazy("UserStore");
export const UserProfileStore: GenericStore = waitForStoreLazy("UserProfileStore");
export const SelectedChannelStore: Stores.SelectedChannelStore & t.FluxStore = waitForStoreLazy("SelectedChannelStore");
export const SelectedGuildStore: t.FluxStore & Record<string, any> = waitForStoreLazy("SelectedGuildStore");
export const ChannelStore: Stores.ChannelStore & t.FluxStore = waitForStoreLazy("ChannelStore");
export const GuildMemberStore: Stores.GuildMemberStore & t.FluxStore = waitForStoreLazy("GuildMemberStore");
export const RelationshipStore = waitForStoreLazy("RelationshipStore") as Stores.RelationshipStore & t.FluxStore & {
    /** Get the date (as a string) that the relationship was created */
    getSince(userId: string): string;
};

export const EmojiStore: t.EmojiStore = waitForStoreLazy("EmojiStore");
export const WindowStore: t.WindowStore = waitForStoreLazy("WindowStore");
export const DraftStore: t.DraftStore = waitForStoreLazy("DraftStore");

/**
 * React hook that returns stateful data for one or more stores
 * You might need a custom comparator (4th argument) if your store data is an object
 *
 * @param stores The stores to listen to
 * @param mapper A function that returns the data you need
 * @param idk some thing, idk just pass null
 * @param isEqual A custom comparator for the data returned by mapper
 *
 * @example const user = useStateFromStores([UserStore], () => UserStore.getCurrentUser(), null, (old, current) => old.id === current.id);
 */
export const { useStateFromStores }: {
    useStateFromStores: <T>(
        stores: t.FluxStore[],
        mapper: () => T,
        idk?: any,
        isEqual?: (old: T, newer: T) => boolean
    ) => T;
}
    = waitForPropsLazy("useStateFromStores");
