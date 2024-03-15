/*
 * Vencord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { waitForPropsLazy } from "@webpack";

import * as t from "./types/settingsStores";


export const TextAndImagesSettingsStores = waitForPropsLazy("MessageDisplayCompact") as Record<string, t.SettingsStore>;
export const StatusSettingsStores = waitForPropsLazy("ShowCurrentGame") as Record<string, t.SettingsStore>;

export const UserSettingsActionCreators = waitForPropsLazy("PreloadedUserSettingsActionCreators");
