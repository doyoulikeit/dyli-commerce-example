"use client";
import { createContext, useContext } from "react";
// Shared dialogs do not import the wallet SDK. Live auth supplies this value;
// anonymous demo dialogs use the default without loading a signing provider.
export const WalletPromptContext = createContext(false);
export const useWalletPrompt = () => useContext(WalletPromptContext);
