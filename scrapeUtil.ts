import * as puppeteer from 'puppeteer';
import * as fs from 'fs';

/**
 * Konfiguration des in Puppeteer enthaltenen Chromium-Browsers
 * 
 * @param url URL der Stellenbörsen-Website
 * @param headlessMode 'true' für headless; 'false' für sichtbar
 */
export async function configureBrowser(url, headlessMode: boolean) {
    const browser = await puppeteer.launch({
        headless: headlessMode,
        defaultViewport: null // Viewport an Fenstergröße anpassen
    });
    const [page] = await browser.pages(); // Ersten Tab auswählen und der 
                                          // Konstante 'page' zuweisen
    await page.goto(url); // übergebene URL aufrufen
    return browser;
}

/**
 * Text in der aktuellen Zeile der Konsole aktualisieren, anstatt ihn in einer neuen Zeile auszugeben.
 * 
 * @param text Text, der in der Konsole erscheinen soll
 */
export function updateCurrentLogLine(text: string) { // Beim Aufruf am Ende ein '\n' übergeben, wenn verhindert werden soll, dass der output bei einem darauffolgenden erneuten Aufruf der Funktion überschrieben wird.
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(text);
}

/**
 * Hilfsfunktion bei der Entwicklung. 
 * Erzeugt automatisch einige Textdateien mit unterschiedlichem Inhalt.
 * 
 * @param number Anzahl der zu erzeugenden Textdateien
 */
export function createTestFiles(number: number) {
    for (let i = 0; i < number; i++) {
        fs.writeFile('testFile' + (i + 1) + '.txt', 'test' + (i + 1), function (err) {
            if (err) return console.log(err);
        });
    }
}