import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import commonEN from './resources/en/common.json';
import commonZH from './resources/zh/common.json';
import appEN from './resources/en/app.json';
import appZH from './resources/zh/app.json';
import composerEN from './resources/en/composer.json';
import composerZH from './resources/zh/composer.json';
import threadsEN from './resources/en/threads.json';
import threadsZH from './resources/zh/threads.json';
import workspacesEN from './resources/en/workspaces.json';
import workspacesZH from './resources/zh/workspaces.json';
import gitEN from './resources/en/git.json';
import gitZH from './resources/zh/git.json';
import filesEN from './resources/en/files.json';
import filesZH from './resources/zh/files.json';
import promptsEN from './resources/en/prompts.json';
import promptsZH from './resources/zh/prompts.json';
import modelsEN from './resources/en/models.json';
import modelsZH from './resources/zh/models.json';
import collaborationEN from './resources/en/collaboration.json';
import collaborationZH from './resources/zh/collaboration.json';
import dictationEN from './resources/en/dictation.json';
import dictationZH from './resources/zh/dictation.json';
import terminalEN from './resources/en/terminal.json';
import terminalZH from './resources/zh/terminal.json';
import debugEN from './resources/en/debug.json';
import debugZH from './resources/zh/debug.json';

const resources = {
  en: {
    common: commonEN,
    app: appEN,
    composer: composerEN,
    threads: threadsEN,
    workspaces: workspacesEN,
    git: gitEN,
    files: filesEN,
    prompts: promptsEN,
    models: modelsEN,
    collaboration: collaborationEN,
    dictation: dictationEN,
    terminal: terminalEN,
    debug: debugEN,
  },
  zh: {
    common: commonZH,
    app: appZH,
    composer: composerZH,
    threads: threadsZH,
    workspaces: workspacesZH,
    git: gitZH,
    files: filesZH,
    prompts: promptsZH,
    models: modelsZH,
    collaboration: collaborationZH,
    dictation: dictationZH,
    terminal: terminalZH,
    debug: debugZH,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: undefined,  // 不硬编码语言，使用浏览器检测或应用设置
    fallbackLng: 'en',
    debug: import.meta.env.DEV,
    interpolation: {
      escapeValue: false,
    },
    ns: ['common', 'app', 'composer', 'threads', 'workspaces', 'git', 'files', 'prompts', 'models', 'collaboration', 'dictation', 'terminal', 'debug'],
    defaultNS: 'common',
  });

export default i18n;
