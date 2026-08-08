import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { detectInitialLanguage } from "./types";

import enCommon from "./locales/en/common.json";
import enSidebar from "./locales/en/sidebar.json";
import enHome from "./locales/en/home.json";
import enHeader from "./locales/en/header.json";
import enSettings from "./locales/en/settings.json";
import enThreads from "./locales/en/threads.json";
import enAbout from "./locales/en/about.json";
import enErrors from "./locales/en/errors.json";
import enComposer from "./locales/en/composer.json";
import enGit from "./locales/en/git.json";
import enWorkspaces from "./locales/en/workspaces.json";
import enLayout from "./locales/en/layout.json";
import enApp from "./locales/en/app.json";
import enPlan from "./locales/en/plan.json";
import enPrompts from "./locales/en/prompts.json";
import enTerminal from "./locales/en/terminal.json";
import enUpdate from "./locales/en/update.json";
import enMobile from "./locales/en/mobile.json";
import enDebug from "./locales/en/debug.json";
import enFiles from "./locales/en/files.json";
import enMessages from "./locales/en/messages.json";

import zhCommon from "./locales/zh-CN/common.json";
import zhSidebar from "./locales/zh-CN/sidebar.json";
import zhHome from "./locales/zh-CN/home.json";
import zhHeader from "./locales/zh-CN/header.json";
import zhSettings from "./locales/zh-CN/settings.json";
import zhThreads from "./locales/zh-CN/threads.json";
import zhAbout from "./locales/zh-CN/about.json";
import zhErrors from "./locales/zh-CN/errors.json";
import zhComposer from "./locales/zh-CN/composer.json";
import zhGit from "./locales/zh-CN/git.json";
import zhWorkspaces from "./locales/zh-CN/workspaces.json";
import zhLayout from "./locales/zh-CN/layout.json";
import zhApp from "./locales/zh-CN/app.json";
import zhPlan from "./locales/zh-CN/plan.json";
import zhPrompts from "./locales/zh-CN/prompts.json";
import zhTerminal from "./locales/zh-CN/terminal.json";
import zhUpdate from "./locales/zh-CN/update.json";
import zhMobile from "./locales/zh-CN/mobile.json";
import zhDebug from "./locales/zh-CN/debug.json";
import zhFiles from "./locales/zh-CN/files.json";
import zhMessages from "./locales/zh-CN/messages.json";

i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: enCommon,
      sidebar: enSidebar,
      home: enHome,
      header: enHeader,
      settings: enSettings,
      threads: enThreads,
      about: enAbout,
      errors: enErrors,
      composer: enComposer,
      git: enGit,
      workspaces: enWorkspaces,
      layout: enLayout,
      app: enApp,
      plan: enPlan,
      prompts: enPrompts,
      terminal: enTerminal,
      update: enUpdate,
      mobile: enMobile,
      debug: enDebug,
      files: enFiles,
      messages: enMessages,
    },
    "zh-CN": {
      common: zhCommon,
      sidebar: zhSidebar,
      home: zhHome,
      header: zhHeader,
      settings: zhSettings,
      threads: zhThreads,
      about: zhAbout,
      errors: zhErrors,
      composer: zhComposer,
      git: zhGit,
      workspaces: zhWorkspaces,
      layout: zhLayout,
      app: zhApp,
      plan: zhPlan,
      prompts: zhPrompts,
      terminal: zhTerminal,
      update: zhUpdate,
      mobile: zhMobile,
      debug: zhDebug,
      files: zhFiles,
      messages: zhMessages,
    },
  },
  defaultNS: "common",
  lng: detectInitialLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;