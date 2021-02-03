import * as inquirer from 'inquirer';
import * as inquirerFileTreeSelection from 'inquirer-file-tree-selection-prompt';
import * as path from 'path';
import * as indeed from './indeed';
import * as reprocessToolkit from './reprocessToolkit';
import * as fs from 'fs';
// import * as stepstone from './stepstone'; // exemplarischer Platzhalter für zukünftiges Scrape-Modul für StepStone 

inquirer.registerPrompt('file-tree-selection', inquirerFileTreeSelection);



//////////////////// Startprompt: //////////////////////


/**
 * Erstellt ein Promise-Objekt und gibt es direkt zurück.
 * 
 * ( Die Rekursion findet nicht in '.prompt()', sondern im anonymen '.then()'-Block statt, welcher dem Event Loop angefügt wird. 
 * Der Call Stack wird dadurch niemals überfüllt. )
 */
function initialPrompt() {
    return inquirer
        .prompt([
            {
                type: 'list',
                message: 'Was möchten Sie tun?', // Info-Text
                name: 'action',
                choices: [ // selektierbare Listenelemente
                    'Neuen Datenbestand extrahieren',
                    'Bestehenden Datenbestand aufbereiten',
                    'Word-Count-Liste/-Tabelle für Frequenzanalysen erstellen',
                    // 'Datenbestand analysieren', 
                    new inquirer.Separator( // gibt eine nicht selektierbare Zeile aus
                        '________________'),
                    'Programm Beenden (Strg+C)'
                ]
            }
        ])
        .then(answers => {
            switch (answers.action) {
                case 'Neuen Datenbestand extrahieren': {
                    newScrapePrompt();
                    break;
                }
                case 'Bestehenden Datenbestand aufbereiten': {
                    reprocessPrompt();
                    break;
                }
                case 'Word-Count-Liste/-Tabelle für Frequenzanalysen erstellen': {
                    wordCountListPrompt();
                    break;
                }
                /*
                case 'Datenbestand analysieren': {

                }
                */
                case 'Programm Beenden (Strg+C)': {
                    process.exit();
                }
                default: {
                    console.log('Diese Funktion ist noch nicht verfügbar.');
                    initialPrompt();
                    break;
                }
            }
        });
}



///////////////////// Extraktion: ///////////////////////


let newScrapeQuestions = [
    {
        type: 'checkbox',
        message: 'Bitte wählen Sie die Stellenbörsen aus, die bei der Generierung des Datenbestandes einbezogen werden sollen:',
        name: 'jobboards', //answers.jobboards gibt ein array mit allen ausgewählten choices zurück
        choices: [
            'Indeed.com',
            'Stepstone.de'/*,
            'Monster.de',
            'Xing.com'
            */
        ]
    },
    {
        type: 'file-tree-selection',
        message: 'Bitte wählen Sie ein Zielverzeichnis für den Datenbestand aus:',
        name: 'outputDir',
        onlyShowDir: true,
        when: (answers) => answers.jobboards.length >= 1
    },
    {
        type: 'input',
        message: 'Welcher Suchbegriff soll verwendet werden?',
        name: 'what',
        when: (answers) => answers.jobboards.length >= 1
    },
    {
        type: 'input',
        message: 'Auf welchen Ort/PLZ soll sich die Suche beziehen?',
        name: 'where',
        when: (answers) => answers.jobboards.length >= 1
    }
];

function newScrapePrompt() {
    return inquirer
        .prompt(newScrapeQuestions)
        .then(answers => {
            if (answers.jobboards.length >= 1) {
                answers.outputDir = reprocessToolkit.addNumberToPath(path.join(answers.outputDir, 'scrapeOutput'));
                console.log('Extraktion wird gestartet...');
                nextScrape(answers, 0);
            } else {
                console.log('Es muss mindestens eine Stellenbörse ausgewählt werden! (Leertaste)');
                newScrapePrompt(); // zurück zur Stellenbörsenauswahl
            }
        });
}

/**
 * Herleitung der korrekten Extraktionsfunktion für die jeweilige Stellenbörse
 * 
 * @param jobboard 
 * @param answers 
 */
async function scrapeJobboard(jobboard: string, answers) { 
    switch (jobboard) {
        case 'Indeed.com': {
            await indeed.scrape({
                what: answers.what,
                where: answers.where,
                outputDir: answers.outputDir
            });
            break;
        }
        case 'Stepstone.de': { // als Dummy

            // break;
        }
        /*
        case 'Monster.de': {

            break;
        }
        case 'Xing.com': {

            break;
        }
        */
        default: {
            console.log(`Die Stellenbörse \'${jobboard}\' wird noch nicht unterstützt.`);
            break;
        }
    }
}

/**
 * rekursives Durchlaufen der vom Benutzer ausgewählten Stellenbörsen
 * 
 * @param answers Answers-Objekt aus 'newScrapePrompt()'
 * @param i Index der Stellenbörse
 */
function nextScrape(answers, i: number) { 
    scrapeJobboard(answers.jobboards[i], answers)
        .then(() => { // Jede Scrape-Funktion wird erst ausgeführt, nachdem die vorherige abgeschlossen ist 
            if (++i < answers.jobboards.length) {
                nextScrape(answers, i);
            } else {
                console.log(`Der erzeugte Datenbestand befindet sich unter \"${answers.outputDir}\"`);
                initialPrompt();
            }
        });
}



//////////////////// Aufbereitung: //////////////////////


let reprocessQuestions = [
    {
        type: 'file-tree-selection',
        message: 'Bitte wählen Sie ein Verzeichnis aus, welches einen zuvor erzeugten Datenbestand enthält:',
        name: 'inputDir',
        onlyShowDir: true
    },
    {
        type: 'file-tree-selection',
        message: 'Bitte wählen Sie ein Zielverzeichnis für den aufbereiteten Datenbestand aus:',
        name: 'outputDir',
        onlyShowDir: true
    },
    {
        type: 'list',
        message: 'Auf welche Weise sollen die Daten aufbereitet werden?',
        name: 'reprocessMethod',
        choices: [
            'HTML-Tags entfernen',
            'Eingrenzung auf relevante Textteile',
            'Unverarbeitete Wortliste erstellen',
        ]
    }
];

function reprocessPrompt() {
    return inquirer
        .prompt(reprocessQuestions)
        .then(answers => {
            switch (answers.reprocessMethod) {
                case 'HTML-Tags entfernen': {
                    reprocessToolkit.removeHtmlTags(answers.inputDir, answers.outputDir);
                    break;
                }
                case 'Eingrenzung auf relevante Textteile': { // Durch Eingrenzung auf Textfragmente, die eine Beschreibung der Qualifikation / des Profils / der Tätigkeiten im Job enthalten
                    reprocessToolkit.narrowDown(answers.inputDir, answers.outputDir);
                    break;
                }
                case 'Unverarbeitete Wortliste erstellen': { 
                    let outputFile = reprocessToolkit.addNumberToPath(path.join(answers.outputDir, 'wordlist'), '.txt');
                    reprocessToolkit.createWordlist(answers.inputDir, outputFile);
                    console.log(`Es wurde eine neue Wortliste erstellt: \"${outputFile}\"`);
                    break;
                }
                default: {
                    console.log('Diese Funktion ist noch nicht verfügbar.');
                    break;
                }
            }
        })
        .then(() => {
            initialPrompt();
        });
}



/////////////////// Word-Count-Liste bzw. Analyse: /////////////////////


let wordCountListQuestions = [
    reprocessQuestions[0], // Verzeichnis eines zuvor erzeugten DB's
    {
        type: 'file-tree-selection',
        message: 'Bitte wählen Sie ein Zielverzeichnis für die zu erzeugende Datei aus:',
        name: 'outputDir',
        onlyShowDir: true
    },
    {
        type: 'list', // Evtl als Checkbox, um mehrere Listen unterschiedlicher Dateitypen gleichzeitig zu erzeugen
        message: 'Wählen Sie den gewünschten Dateityp aus:',
        name: 'filetype',
        choices: [
            '.txt (zeilenweise im Format \"Anzahl Wort\")',
            '.xlsx (Excel-Tabelle im Format \"Wort|Anzahl\")'
        ]
    }
];

function wordCountListPrompt() {
    return inquirer
        .prompt(wordCountListQuestions)
        .then(answers => {
            console.log('Wordcount-Liste im Format \"' + answers.filetype.substr(0, 5).trim() + '\" wird erstellt...');
            let wordlistFile = reprocessToolkit.addNumberToPath(path.join(answers.outputDir, 'wordlist'),'.txt');
            switch(answers.filetype) {
                case '.txt (zeilenweise im Format \"Anzahl Wort\")': {
                    try {
                        reprocessToolkit.createWordlist(answers.inputDir, wordlistFile);
                    } finally { // um abzuwarten, bis die vorherige Funktion komplett fertig ist
                        reprocessToolkit.countAndSortWords(wordlistFile, reprocessToolkit.addNumberToPath(path.join(answers.outputDir, 'sortedWordCountList'), '.txt'));
                        fs.unlinkSync(wordlistFile); // wordlistX.txt löschen (da sie nur als Hilfsdatei zur Erzeugung der anderen Datei diente)
                    }
                    break;
                }
                case '.xlsx (Excel-Tabelle im Format \"Wort|Anzahl\")': {
                    // dummy
                }
                default: {
                    console.log('Dieser Dateityp wird noch nicht unterstützt.');
                }
            }
        })
        .then(() => {
            initialPrompt();
        });
}

// Aufruf der Startprompt zum Programmstart
initialPrompt();