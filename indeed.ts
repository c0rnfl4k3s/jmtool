import * as fs from 'fs';
import * as scrapeUtil from './scrapeUtil';
import * as path from 'path';

/**
 * Zur Verhinderung der Anzeige von Popovers auf den Suchergebnisseiten.
 * 
 * @param page Tab einer Suchergebnisseite im Chromium-Browser 
 */
async function hidePopovers(page) { 
    await page.evaluateOnNewDocument(() => {
        // wird immer sofort ausgeführt, nachdem die page navigiert wurde:
        let style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = '.popover{display: none !important}';
        setTimeout(() => { // timeout um zu warten, bis das head element geladen ist
            let elements = document.getElementsByTagName('head');
            let [head] = Array.from(elements);
            head.append(style);
        }, 1000);
    });
}

/**
 * Gibt die auf der ersten Suchergebnisseite angezeigte Trefferzahl zurück.
 * 
 * @param page Tab einer Suchergebnisseite im Chromium-Browser 
 */
async function detectTotalResults(page) {
    await page.waitForSelector('#searchCountPages');
    let totalResults = await page.$eval('#searchCountPages', (element) => {
        let numStringParts = element.innerHTML.trim().split(' ');
        let num = numStringParts[3].replace('.', '');
        return num;
    });
    return totalResults;
};

interface scrapeOptions {
    what: string,
    where: string,
    outputDir: fs.PathLike
}

/**
 * Hauptfunktion zur Extraktion von Indeed.com
 * 
 * @param options Extraktionsparameter-Objekt (bestehend aus einem Suchbegriff, einem Ort / einer PLZ und dem Zielverzeichnis für den Datenbestand)
 */
export async function scrape(options: scrapeOptions) {

    // Vorbereitung:
    if (!fs.existsSync(options.outputDir)) {
        await fs.mkdirSync(options.outputDir);
    }
    const browser = await scrapeUtil.configureBrowser('https://de.indeed.com/', false); // Headless Mode ist standardmäßig deaktiviert. Zum Aktivieren den zweiten Parameter durch den Wert "true" ersetzen
    const [page] = await browser.pages();
    await hidePopovers(page);

    // Suche starten:
    await page.type('#text-input-what', options.what);
    await page.type('#text-input-where', options.where);
    await page.$eval('#whatWhereFormId', form => form.submit());
    console.log('\nSuche nach "' + options.what + '"-Jobs in ' + options.where + ' auf Indeed.com\n...');

    let totalResults = await detectTotalResults(page);
    console.log('Indeed.com zeigt eine Trefferzahl von ' + totalResults + ' an.');

    let lastResultReached = false; // wird nach dem letzten scrape auf der Suchergebnisseite geprüft
    let resultCount = 0;
    let failCount = 0;

    do { // Ergebnisseiten durchiterieren
        await page.waitFor(3000); // die Wartezeit lässt sich eventuell reduzieren
        let results = await page.$$('.result');
        let newPagePromise;
        let currentResultPage;
        let currentJobTitle;

        for (let result of results) { // Ergebnisse auf einer Suchergebnisseite durchiterieren
            newPagePromise = new Promise(x => browser.once('targetcreated', target => x(target.page()))); // one-time-listener auf neuen Tab
            await result.click(); // neuer Tab wird geöffnet (und ist im browser automatisch ausgewählt), triggert das event 'targetcreated'
            currentResultPage = await newPagePromise;

            // Prüfung auf Hiring-Event-Seite:
            if (currentResultPage.url().startsWith('https://events')) {
                console.log(`\n\x1b[31m"Hiring Event"-Seite erkannt:\x1b[0m Ergebnis Nr. ${++resultCount} wird übersprungen. Die Extraktion wird mit dem nächsten Ergebnis fortgesetzt.`);
                failCount++;
                await currentResultPage.close();
                continue;
            };

            // Metadaten extrahieren:
            currentJobTitle = await currentResultPage.title();
            try {
                await currentResultPage.waitForSelector('#jobDescriptionText', { timeout: 5000 }); // Beschreibungstext
                await currentResultPage.waitForSelector('.icl-u-lg-mr--sm.icl-u-xs-mr--xs', { timeout: 2000 }); // Name des Arbeitgebers
            } catch (error) {
                console.log(`\n\x1b[31mError\x1b[0m: Die Inhalte von Ergebnis Nr. ${++resultCount} konnten nicht geladen werden. Die Extraktion wird mit dem nächsten Ergebnis fortgesetzt.`);
                failCount++;
                await currentResultPage.close();
                continue;
            }

            scrapeUtil.updateCurrentLogLine('Ergebnis Nr. ' + (++resultCount) + ' wird gescrapet: "' + currentJobTitle.substr(0, 50) + '(...)"');
            let employer = await currentResultPage.$eval('.icl-u-lg-mr--sm.icl-u-xs-mr--xs' // Das Element, welches den Namen des Arbeitgebers enthält, gehört auf Indeed.com immer diesen beiden Klassen an.
                , (element) => {
                    return element.innerHTML;
                });
            let jobBoard = 'indeed.com';

            // Beschreibungstext extrahieren:
            let jobDescription = await currentResultPage.$eval('#jobDescriptionText', (element) => {
                return element.innerHTML;
            });
            let output = '<jobboard>' + jobBoard + '</jobboard>\n<employer>' + employer + '</employer>\n<title>' + currentJobTitle + '</title>\n\n' + jobDescription; // Damit diese Eigenschaften über JQuery bzw. Cheerio adressierbar sind

            // extrahierte Daten in eine neue Textdatei schreiben:
            fs.writeFile(options.outputDir + path.sep + 'scrapeOutput' + resultCount + '.txt', output, (err) => {
                if (err) throw err;
            });

            await currentResultPage.close();
        }
        try {
            await page.$eval('#resultsCol > div.pagination > a:last-child', (element) => { // Weiter-Button der Navigationsleiste am unteren Ende der Suchergebnisseite
                if (element.innerHTML.includes('Weiter')) {
                    element.click();
                } else { // Auf der letzten Suchergebisseite existiert der Weiter-Button nicht mehr
                    lastResultReached = true;
                }
            });
        } catch (error) { 
            // bei etwaigen Programmfehlern lässt sich hier der weitere Programmablauf konkreter beschreiben
            continue;
        } 
    } while (!lastResultReached);


    scrapeUtil.updateCurrentLogLine(`Der Scrape-Vorgang auf Indeed.com wurde nach ${resultCount} Ergebnissen beendet.\n${failCount} Ergebnisse wurden verworfen.\n`);

    browser.close();
}