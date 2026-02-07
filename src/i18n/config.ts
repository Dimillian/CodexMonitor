import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import commonEN from './resources/en/common.json';
import commonZH from './resources/zh/common.json';
import commonES from './resources/es/common.json';
import commonFR from './resources/fr/common.json';
import commonDE from './resources/de/common.json';

import appEN from './resources/en/app.json';
import appZH from './resources/zh/app.json';
import appES from './resources/es/app.json';
import appFR from './resources/fr/app.json';
import appDE from './resources/de/app.json';

import composerEN from './resources/en/composer.json';
import composerZH from './resources/zh/composer.json';
import composerES from './resources/es/composer.json';
import composerFR from './resources/fr/composer.json';
import composerDE from './resources/de/composer.json';

import threadsEN from './resources/en/threads.json';
import threadsZH from './resources/zh/threads.json';
import threadsES from './resources/es/threads.json';
import threadsFR from './resources/fr/threads.json';
import threadsDE from './resources/de/threads.json';

import workspacesEN from './resources/en/workspaces.json';
import workspacesZH from './resources/zh/workspaces.json';
import workspacesES from './resources/es/workspaces.json';
import workspacesFR from './resources/fr/workspaces.json';
import workspacesDE from './resources/de/workspaces.json';

import gitEN from './resources/en/git.json';
import gitZH from './resources/zh/git.json';
import gitES from './resources/es/git.json';
import gitFR from './resources/fr/git.json';
import gitDE from './resources/de/git.json';

import filesEN from './resources/en/files.json';
import filesZH from './resources/zh/files.json';
import filesES from './resources/es/files.json';
import filesFR from './resources/fr/files.json';
import filesDE from './resources/de/files.json';

import promptsEN from './resources/en/prompts.json';
import promptsZH from './resources/zh/prompts.json';
import promptsES from './resources/es/prompts.json';
import promptsFR from './resources/fr/prompts.json';
import promptsDE from './resources/de/prompts.json';

import modelsEN from './resources/en/models.json';
import modelsZH from './resources/zh/models.json';
import modelsES from './resources/es/models.json';
import modelsFR from './resources/fr/models.json';
import modelsDE from './resources/de/models.json';

import collaborationEN from './resources/en/collaboration.json';
import collaborationZH from './resources/zh/collaboration.json';
import collaborationES from './resources/es/collaboration.json';
import collaborationFR from './resources/fr/collaboration.json';
import collaborationDE from './resources/de/collaboration.json';

import dictationEN from './resources/en/dictation.json';
import dictationZH from './resources/zh/dictation.json';
import dictationES from './resources/es/dictation.json';
import dictationFR from './resources/fr/dictation.json';
import dictationDE from './resources/de/dictation.json';

import terminalEN from './resources/en/terminal.json';
import terminalZH from './resources/zh/terminal.json';
import terminalES from './resources/es/terminal.json';
import terminalFR from './resources/fr/terminal.json';
import terminalDE from './resources/de/terminal.json';

import debugEN from './resources/en/debug.json';
import debugZH from './resources/zh/debug.json';
import debugES from './resources/es/debug.json';
import debugFR from './resources/fr/debug.json';
import debugDE from './resources/de/debug.json';

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
  es: {
    common: commonES,
    app: appES,
    composer: composerES,
    threads: threadsES,
    workspaces: workspacesES,
    git: gitES,
    files: filesES,
    prompts: promptsES,
    models: modelsES,
    collaboration: collaborationES,
    dictation: dictationES,
    terminal: terminalES,
    debug: debugES,
  },
  fr: {
    common: commonFR,
    app: appFR,
    composer: composerFR,
    threads: threadsFR,
    workspaces: workspacesFR,
    git: gitFR,
    files: filesFR,
    prompts: promptsFR,
    models: modelsFR,
    collaboration: collaborationFR,
    dictation: dictationFR,
    terminal: terminalFR,
    debug: debugFR,
  },
  de: {
    common: commonDE,
    app: appDE,
    composer: composerDE,
    threads: threadsDE,
    workspaces: workspacesDE,
    git: gitDE,
    files: filesDE,
    prompts: promptsDE,
    models: modelsDE,
    collaboration: collaborationDE,
    dictation: dictationDE,
    terminal: terminalDE,
    debug: debugDE,
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
