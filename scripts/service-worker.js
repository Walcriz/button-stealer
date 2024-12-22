const MAXIMUM = 'maximum';
const CNTFL_MGMT_API_KEY = 'contentManagementApiKey';
const CNTFL_DLVR_API_KEY = 'contentDeliveryApiKey';
const CNTFL_SPACE_ID = 'spaceId';
const CNTFL_TYPE_ID = 'contentTypeId';
const CONTENTFUL = 'contentful';
const IGNORE = 'ignore';
const BUTTONS = 'buttons';
const UPLOAD = 'upload';
const OFFSCREEN_DOCUMENT_PATH = '/offscreen/offscreen.html';
let isDark = false;

browser.runtime.onInstalled.addListener(async ({ reason }) => {
    switch (reason) {
        case 'install':
            await browser.storage.local.set({
                buttons: [],
                upload: [],
                ignore: [],
                maximum: 200,
                contentful: {
                    contentManagementApiKey: '',
                    contentDeliveryApiKey: '',
                    spaceId: '',
                    contentTypeId: ''
                }
            });
            break;
        case 'update':
            const { buttons, upload, contentful } = await browser.storage.local.get([BUTTONS, UPLOAD, CONTENTFUL]);
            if (buttons.length === 0) break;
            let counter = buttons.length - 1;
            buttons.forEach(button => { button.id = counter--; button.hidden = false; });
            await browser.storage.local.set({ buttons: buttons });
            if (!upload) await browser.storage.local.set({ 'upload': [] });
            if (!contentful.contentDeliveryApiKey) {
                contentful.contentDeliveryApiKey = '';
                await browser.storage.local.set({ 'contentful': contentful });
            }
            break;
        default:
            break;
    }
});

browser.webNavigation.onCompleted.addListener((details) => {
    if (details.frameId === 0) {
        browser.tabs.sendMessage(details.tabId, { type: 'navigation-success' });
    }
}, { url: [{ urlMatches: '.*' }] });

browser.storage.onChanged.addListener(async (changes) => {
    switch (true) {
        case changes.hasOwnProperty(MAXIMUM):
            const { buttons } = await browser.storage.local.get(BUTTONS);
            while (buttons.length >= changes.maximum.newValue) buttons.pop();
            await browser.storage.local.set({ 'buttons': buttons });
            break;
        case changes.hasOwnProperty(UPLOAD):
        case changes.hasOwnProperty(CONTENTFUL):
            await uploadOffscreen();
            break;
        default:
            break;
    }
});

const uploadOffscreen = async () => {
    const { upload, contentful } = await browser.storage.local.get([UPLOAD, CONTENTFUL]);
    if (!(contentful[CNTFL_MGMT_API_KEY] && contentful[CNTFL_DLVR_API_KEY] && contentful[CNTFL_SPACE_ID] && contentful[CNTFL_TYPE_ID])) {
        if (upload.length > 0) await browser.storage.local.set({ 'upload': [] });
        return;
    }
    if (upload.length === 0) {
        browser.runtime.sendMessage({
            type: 'full-sync',
            target: 'offscreen',
            contentful: contentful
        });
        return;
    }
    if (!(await hasDocument())) {
        await createHiddenTab();
    }
    const button = upload[upload.length - 1];
    const type = button.hasOwnProperty('code') ? 'upload-stolen-button' : 'remove-stolen-button';
    browser.runtime.sendMessage({
        type: type,
        target: 'offscreen',
        button: button,
        contentful: contentful
    });
}

const createHiddenTab = async () => {
    const tab = await browser.tabs.create({
        url: browser.runtime.getURL(OFFSCREEN_DOCUMENT_PATH),
        active: false
    });
    return tab.id;
}

const handleMessages = async (message) => {
    if (message.target !== 'background') return;
    switch (message.type) {
        case 'stolen-button-uploaded':
            const { upload } = await browser.storage.local.get(UPLOAD);
            upload.pop();
            browser.runtime.sendMessage({
                type: 'full-refresh',
                target: 'stolen-buttons',
            });
            await browser.storage.local.set({ 'upload': upload });
            break;
        case 'contentful-syncronized':
            await browser.storage.local.set({ buttons: JSON.parse(message.value) });
            await closeHiddenTab();
            break;
        case 'update-maximum':
            await browser.storage.local.set({ maximum: parseInt(message.value) });
            break;
        case 'update-contentful':
            await browser.storage.local.set({ contentful: JSON.parse(message.value) });
            break;
        case 'update-ignore':
            await browser.storage.local.set({ ignore: message.value.split(' ') });
            break;
        case 'remove-all':
            await browser.storage.local.set({ buttons: [], upload: [] });
            break;
        case 'remove-buttons':
            await handleRemoveButtons(JSON.parse(message.value));
            break;
        case 'color-scheme-changed':
            if (isDark !== message.isDark) {
                isDark = message.isDark;
                browser.action.setIcon({
                    "path": {
                        "16": `/images/icon-${isDark ? "dark" : "light"}-16.png`,
                        "32": `/images/icon-${isDark ? "dark" : "light"}-32.png`,
                        "48": `/images/icon-${isDark ? "dark" : "light"}-48.png`,
                        "128": `/images/icon-${isDark ? "dark" : "light"}-128.png`
                    }
                });
            }
            break;
        default:
            break;
    }
}

const handleRemoveButtons = async (selected) => {
    const { buttons, upload } = await browser.storage.local.get([BUTTONS, UPLOAD]);
    selected.forEach(s => {
        for (let i = 0; i < buttons.length; i++) {
            const button = buttons[i];
            if (button.stolenAt === s.stolenAt) {
                if (button.name === s.name) {
                    button.hidden = true;
                    break;
                }
            }
        }
    });
    await browser.storage.local.set({ buttons: buttons });
    upload.unshift(...selected);
    await browser.storage.local.set({ upload: upload });
}

browser.runtime.onMessage.addListener(handleMessages);

const closeHiddenTab = async () => {
    const tabs = await browser.tabs.query({ url: browser.runtime.getURL(OFFSCREEN_DOCUMENT_PATH) });
    for (const tab of tabs) {
        await browser.tabs.remove(tab.id);
    }
}

const hasDocument = async () => {
    const tabs = await browser.tabs.query({ url: browser.runtime.getURL(OFFSCREEN_DOCUMENT_PATH) });
    return tabs.length > 0;
}
