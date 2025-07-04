export default class LoaderBuilder {
  #onlineMatch = `// @match https://bondageprojects.elementfx.com/*
// @match https://www.bondageprojects.elementfx.com/*
// @match https://bondage-europe.com/*
// @match https://www.bondage-europe.com/*
// @match https://bondageprojects.com/*
// @match https://www.bondageprojects.com/*`;
  #localMatch = '// @match http://localhost:*/*'

  constructor() {
    this.isLocal = !process.env.GITHUB_SHA;
    this.isBranch = !this.isLocal && process.env.GITHUB_REF_NAME === 'main' || process.env.GITHUB_REF_NAME === 'beta';
    this.branch = process.env.GITHUB_REF_NAME;
    this.pr = process.env.REVIEW_ID;
    this.label = this.isLocal ? 'local ' : (this.branch === 'main' ? '' : (this.branch.startsWith('pull/') ? `PR #${this.pr}` : this.branch) + ' ');
    this.URL = this.isLocal ? 'http://localhost:4000' : this.getGitHubURL();
  }
  
  getGitHubURL() {
    const repo = process.env.GITHUB_REPOSITORY;
    const [owner, repoName] = repo.split('/');
    return `https://${owner}.github.io/${repoName}/`;
  }

  getUserScriptMeta(isFUSAM) {
    return `// ==UserScript==
// @name WCE ${this.label}loader${isFUSAM ? ' with FUSAM' : ''}
// @namespace https://www.bondageprojects.com/
// @version ${isFUSAM ? '1.5' : '1.2'}
// @description Wholesome Club Extensions (WCE) - enhancements for the bondage club - fork of FBC 5.8
// @author Sidious, Stella
// @supportURL https://github.com/KittenApps/WCE
${this.isLocal ? this.#localMatch : this.#onlineMatch}
// @icon https://wce-docs.vercel.app/img/logo.png
// @grant none
// @run-at document-end
// ==/UserScript==`;
  }


  generateFusamLoader() {
    if (this.isBranch) {
      return `${this.getUserScriptMeta(true)}

import(\`https://sidiousious.gitlab.io/bc-addon-loader/fusam.js?v=\${(Date.now()/10000).toFixed(0)}\`);

var fusam = JSON.parse(localStorage.getItem("fusam.settings") || "{}");
fusam.enabledDistributions ??= {};
fusam.enabledDistributions.WCE ??= "${process.env.BRANCH === 'main' ? 'stable' : 'dev'}";
const URL = fusam.enabledDistributions.WCE === "stable" ? "https://wce.netlify.app" : "https://beta--wce.netlify.app" ;

var preloadLink = document.createElement("link");
preloadLink.href = \`\${URL}/wce.js\`;
preloadLink.rel = "modulepreload";
document.head.appendChild(preloadLink);

var dexiePreloadLink = document.createElement("link");
dexiePreloadLink.href = \`\${URL}/dexie.js\`;
dexiePreloadLink.rel = "modulepreload";
document.head.appendChild(dexiePreloadLink);

delete fusam.enabledDistributions.FBC;
localStorage.setItem("fusam.settings", JSON.stringify(fusam));`;
    } else {
      return `${this.getUserScriptMeta(true)}

import(\`https://sidiousious.gitlab.io/bc-addon-loader/fusam.js?v=\${(Date.now()/10000).toFixed(0)}\`).then(() => import("${this.URL}/wce.js"));

var preloadLink = document.createElement("link");
preloadLink.href = "${this.URL}/wce.js";
preloadLink.rel = "modulepreload";
document.head.appendChild(preloadLink);

var dexiePreloadLink = document.createElement("link");
dexiePreloadLink.href = "${this.URL}/dexie.js";
dexiePreloadLink.rel = "modulepreload";
document.head.appendChild(dexiePreloadLink);

var fusam = JSON.parse(localStorage.getItem("fusam.settings") || "{}");
fusam.enabledDistributions ??= {};
delete fusam.enabledDistributions.WCE;
delete fusam.enabledDistributions.FBC;
localStorage.setItem("fusam.settings", JSON.stringify(fusam));`;
    }
  }

  generateStandaloneLoader() {
    return `${this.getUserScriptMeta(false)}

var preloadLink = document.createElement("link");
preloadLink.href = "${this.URL}/wce.js";
preloadLink.rel = "modulepreload";
document.head.appendChild(preloadLink);

var dexiePreloadLink = document.createElement("link");
dexiePreloadLink.href = "${this.URL}/dexie.js";
dexiePreloadLink.rel = "modulepreload";
document.head.appendChild(dexiePreloadLink);

var fusam = JSON.parse(localStorage.getItem("fusam.settings") || "{}");
fusam.enabledDistributions ??= {};
delete fusam.enabledDistributions.WCE;
delete fusam.enabledDistributions.FBC;
localStorage.setItem("fusam.settings", JSON.stringify(fusam));

if (typeof FUSAM === "object" && FUSAM?.present) {
  import("${this.URL}/wce.js");
} else {
  let storeFUSAM;
  Object.defineProperty(window, "FUSAM", {
    set(n) {
      storeFUSAM = n;
      import("${this.URL}/wce.js");
    },
    get() {
      return storeFUSAM;
    },
  });
}`
  }
}
