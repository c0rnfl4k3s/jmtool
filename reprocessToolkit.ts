import * as fs from 'fs';
import * as cheerio from 'cheerio';
import * as path from 'path';
import * as lineByLine from 'n-readlines';

/**
 * Prüft, ob es sich bei dem übergebenen Pfad um eine Datei handelt.
 * 
 * @param path Zu prüfender Dateipfad
 */
function checkFilePath(path: fs.PathLike) { 
	try {
		let stat = fs.statSync(path);
		if (!stat.isFile()) {
			console.log('\x1b[31mError\x1b[0m: Der übergebene Pfad ist keine Datei');
			return false;
		}
	} catch(e) {
		console.log('\x1b[31mError\x1b[0m: Ungültiger Pfad');
		return false;
	}
	return true;
}

/**
 * Umwandlung in einen eindeutigen Verzeichnis-/Dateinamen zur Vermeidung von Schreibzugriffen auf bereits bestehende Dateien und Verzeichnisse.
 * 
 * @param path Verzeichnisname oder Dateiname ohne Endung
 * @param ext Dateiendung, z.B. ".txt"
 */
export function addNumberToPath(path, ext?: string) {
    for(let i = 1; i <= 1000; i++) { // Begrenzung auf 1000 um sicherzustellen, dass keine endlosschleife möglich ist
        if(!fs.existsSync('' + path + i) && !fs.existsSync('' + path + i + ext)){
            path = '' + path + i;
            if(ext != undefined) {
                path += ext;
            }
            return path;
        }
    }
    console.log('\x1b[31mError\x1b[0m: In diesem Verzeichnis befinden sich zu viele Dateien oder Unterverzeichnisse.\nBitte versuchen Sie es erneut mit einem anderen Verzeichnis.')
}

/**
 * Zur Bereinigung eines Datenbestandes von HTML-Tags.
 * 
 * @param inputDir Quellverzeichnis eines bereits bestehenden Datenbestandes
 * @param outputDir Äußeres Zielverzeichnis für den aufbereiteten Datenbestand
 */
export function removeHtmlTags(inputDir, outputDir){
	outputDir = addNumberToPath(path.join(outputDir, inputDir.substr(inputDir.lastIndexOf(path.sep)+1) + '_noHtmlTags')); // eindeutigen Namen des inneren Zielverzeichnisses generieren
	let files = fs.readdirSync(inputDir);
	if (files.length >= 1 && !fs.existsSync(outputDir)) { 
        fs.mkdirSync(outputDir); // Verzeichnis erstellen falls noch nicht vorhanden
    }
    files.sort(function(a, b) { // nach Änderungszeitpunkt sortieren , damit die Dateien danach auch in dieser Reihenfolge eingelesen werden
        return fs.statSync(path.join(inputDir, a)).mtime.getTime() - fs.statSync(path.join(inputDir, b)).mtime.getTime();
    });
    let newFileCount = 0;
	for(let file of files) {
		let pathOfCurrentFile = path.join(inputDir, file);
		
		let stat = fs.statSync(pathOfCurrentFile);

		// nur einlesen, wenn es eine file (also keine 'dir') ist:
		if(stat.isFile()){
            let data = fs.readFileSync(pathOfCurrentFile, 'utf8');
            let $ = cheerio.load(data);
            let result = ' ';
            result += ('Stellenbörse: ' + $('jobboard').text().trim() + '\n'
            + 'Suchbegriff: ' + $('what').text().trim() + '\n'
            + 'Ort: ' + $('where').text().trim() + '\n'
            + 'Zeitstempel: ' + $('timestamp').text().trim() + '\n'
            + 'Arbeitgeber: ' + $('employer').text().trim() + '\n'
            + 'Titel: ' + $('title').text().trim() + '\n');
            $('jobboard').remove();
            $('what').remove();
            $('where').remove();
            $('timestamp').remove();
            $('employer').remove();
            $('title').remove();
            result += $('body').html();
			result = result.replace(/(<([^>]+)>)/ig, ' '); // HTML-Tags durch Leerzeichen ersetzen
			result = result.replace('\n ', '\n');
            fs.writeFileSync(path.join(outputDir, file), result);
            newFileCount++;
		}
    }
    if(newFileCount >= 1) {
        console.log(`Es wurden ${newFileCount} neue Dateien erzeugt.\nDie Dateien befinden sich in \"${outputDir}\".`);
    } else {
        console.log('Es wurden keine neuen Dateien erzeugt. Möglicherweise wurde ein falsches oder leeres Verzeichnis als Input übergeben.');
    }
}




///////////////////// Eingrenzung auf besonders relevante Textteile: //////////////////////


/**
 * Eingrenzungslogik für von Indeed.com extrahierte Datenbestände.
 * 
 * @param $ Cheerio-Objekt
 * @param conditionsForKeep Array mit Strings, welche regelmäßig in den Überschriften besonders relevanter Sektionen vorkommen
 */
function narrowDownAnIndeedScrape($, conditionsForKeep) {
    let outputData = '';
    $('.jobSectionHeader').each((i, header) => { // index, element
        let headerText = $(header).text().trim();
        if(conditionsForKeep.some((conditionString) => { // wenn mindestens einer der Strings im Array 'conditionsForKeep' im header (e) enthalten ist ...
            return headerText.toLowerCase().includes(conditionString);
        })) { // ... dann ...
            if(outputData === '') { // verhindert das versehentliche mehrfache Hinzufügen der Metadaten
                outputData += ('Stellenbörse: ' + $('jobboard').text().trim() + '\n'
                + 'Suchbegriff: ' + $('what').text().trim() + '\n'
                + 'Ort: ' + $('where').text().trim() + '\n'
                + 'Zeitstempel: ' + $('timestamp').text().trim() + '\n'
                + 'Arbeitgeber: ' + $('employer').text().trim() + '\n'
                + 'Titel: ' + $('title').text().trim() + '\n');
            }
            outputData += ('\n' + headerText + '\n\n');

            // Text unter dem header dynamisch selecten:
            // ausgehend vom header dessen Eltern-Elemente durchlaufen, bis ein Element erreicht wird, welches ein Geschwister-Element hat, das nicht-leere Textknoten beinhaltet.
            let lauf = $(header);
            let loopCount = 0;
            let maxLoopCount = 5;
            while(lauf.next().text().trim() === '') {
                if(loopCount >= maxLoopCount) { // Wenn endlosschleife: Datei überspringen.
                    outputData = '';
                    return;
                }
                lauf = lauf.parent();
                loopCount++;
            }
            let sectionContent = lauf.next().text().trim();

            outputData += (sectionContent + '\n');
        }
    });
    return outputData;
}

/**
 * ! Noch nicht funktional !
 * 
 * Soll bei allen Stellenbörsen funktionieren, bei denen die relevanten Sections direkt über passende (Klassen-)Selektoren adressierbar sind, und sich die Funktion nur in
 * der Bezeichnung der Selektoren unterscheidet.
 * 
 * @param headerSelectorsInOrder Array aus Header-Selektoren, die jeweils zu den Sections an der gleichen Stelle des 'sectionsInOrder'-Arrays gehören
 * @param sectionSelectorsInOrder Array aus Content-Selektoren, die jeweils zu dem Header mit dem korrespondierendem Index des 'headersInOrder'-Arrays gehören
 */
function universalNarrowDown(headerSelectorsInOrder: string[], sectionSelectorsInOrder: string[]) {
    // Zusammensetzung und Rückgabe (als String) der als relevant identifizierten header und dazu korrespondierenden sections 
}

/**
 * Hauptfunktion zur Eingrenzung eines Datenbestandes auf besonders relevante Textteile.
 * 
 * @param inputDir Quellverzeichnis eines bereits bestehenden Datenbestandes
 * @param outputDir Äußeres Zielverzeichnis für den aufbereiteten Datenbestand 
 */
export function narrowDown(inputDir, outputDir) {
    outputDir = addNumberToPath(path.join(outputDir, inputDir.substr(inputDir.lastIndexOf(path.sep)+1) + '_narrowedDown'));
    let files = fs.readdirSync(inputDir);
    if (!fs.existsSync(outputDir)) { // Verzeichnis erstellen falls noch nicht vorhanden
        fs.mkdirSync(outputDir);
    }
    let newFileCount = 0; // Anzahl neu erzeugter Dateien
    files.sort(function(a, b) { // nach Änderungszeitpunkt sortieren (damit sie auch in dieser reihenfolge eingelesen werden)
        return fs.statSync(path.join(inputDir, a)).mtime.getTime() - fs.statSync(path.join(inputDir, b)).mtime.getTime();
	});
    for(let file of files) { // zuvor extrahierten Datenbestand durchiterieren
        console.log('Aktuelle Datei: ' + file);
        let pathOfCurrentFile = path.join(inputDir, file);
        let conditionsForKeep = ['aufgabe', 'anforderung', 'profil', 'qualifikation', 'rolle', 'bring', 'voraussetzung', 'wir erwarten', 'erwarten wir', 'tätigkeit', 'überzeugst', 'fähigkeit'];
        // let conditionsForDiscard = ['benefits', 'vorteile', 'bieten', 'karriere', 'bewerbung', 'bewirb', 'arbeitgeber']; // als Idee zur Verbesserung der Genauigkeit, falls notwendig
        let outputData;
        let $ = cheerio.load(fs.readFileSync(pathOfCurrentFile));
        
        // Die relevanten sections extrahieren, abhängig von der Stellenbörse:
        switch($('jobboard').text().trim()) { 
            case 'indeed.com': {
                outputData = narrowDownAnIndeedScrape($, conditionsForKeep);
                break;
            }
            case 'stepstone.de': {
                // beispielhafte mögliche Vorgehensweise:
                // let headerSelectors: string[] = ['.at-section-text-description h4', '.at-section-text-profile'];
                // let sectionSelectors: string[] = ['.at-section-text-description-content', '.at-section-text-profile-content'];
                // outputData = universalNarrowDown(headerSelectors, sectionSelectors);
                // break;
            }
            case 'monster.de': {

            }
            case 'xing.com': {

            }
            default: {
                console.log(`\x1b[31mDie Stellenbörse, der diese Datei entstammt, wird noch nicht unterstützt oder wurde nicht erkannt.\x1b[0m
                    \n(eingelesene Bezeichnung der Stellenbörse: \"${$('jobboard').text().trim()}\")`);
                break;
            }
        }

        // Erzeugung der aufbereiteten Textdatei
        if(outputData !== '') {
            newFileCount++;
            let newFileName = file.replace(/\.[^/\\.]+$/, '') + '_narrowedDown.txt';
            fs.writeFileSync(path.join(outputDir, newFileName), outputData);
            console.log('\x1b[32mEingrenzung erfolgreich. Datei \'' + newFileName + '\' wurde erstellt.\x1b[0m\n')
        } else {
            console.log('\x1b[31mDie Datei kann nicht zur Eingrenzung verwendet werden.\x1b[0m\n');
        }
    }
    console.log('Es wurden ' + newFileCount + ' neue Dateien erzeugt.\nDie Dateien befinden sich unter \"' + outputDir + '\"');
}




//////////////////// Word-Count-Liste erstellen: /////////////////////


/**
 * Erstellt aus den gescrapeten Dateien eine große Wortliste mit einem Wort pro Zeile.
 * Ermöglicht die Verwendung von node-readlines zum Zählen der Wörter.
 * 
 * @param inputDir Quellverzeichnis eines Datenbestandes
 * @param outputFile Dateipfad der zu erzeugenden Textdatei
 */
export function createWordlist(inputDir, outputFile){ 
	let outputHandle = fs.openSync(outputFile, "a"); // flag "a" steht für "append" und bewirkt, dass die Daten der Datei hinten angefügt werden, anstatt sie zu überschreiben
	let files = fs.readdirSync(inputDir);
    files.sort(function(a, b) { // nach Änderungszeitpunkt sortieren, damit die Dateien danach auch in dieser Reihenfolge eingelesen werden
        return fs.statSync(path.join(inputDir, a)).mtime.getTime() - fs.statSync(path.join(inputDir, b)).mtime.getTime();
	});
	try {
		for(let file of files) {
			let pathOfCurrentFile = path.join(inputDir, file);
			
			let stat = fs.statSync(pathOfCurrentFile);

			// nur einlesen, wenn es eine Datei und kein Verzeichnis ist:
			if(stat.isFile()){

                let data = fs.readFileSync(pathOfCurrentFile, 'utf8');
                
				// ein paar Wörter ohne analytische Aussagekraft bereits im Voraus herausfiltern:
				let unwantedWords = ['indeed.com', 'stepstone.de', 'monster.de', 'xing.com', 'titel', 'arbeitgeber', 'stellenbörse', 'zeitstempel', 'suchbegriff', 'ort']; 
				let expStr = unwantedWords.join('|');
				let result = ' ' + data; // um zu verhindern, dass das erste Wort der neuen Datei mit dem letzten Wort der vorherigen Datei konkateniert wird
				result = result.replace(new RegExp('\\b(' + expStr + ')\\b', 'gi'), ' ');
				result = result.replace(/(\r\n|\r|\n)+/g, ' '); // Zeilenumbrüche durch Leerzeichen ersetzen (sonst werden einige einzelne Wörter konkateniert)
                result = result.replace(/(<([^>]+)>)/ig, ' '); // HTML-Tags durch Leerzeichen ersetzen
                
                // alle Sonderzeichen außer Ä,ä,Ö,ö,Ü,ü,ß,+,# durch Leerzeichen ersetzen:
				result = result.replace(/[^A-Za-z0-9\u00c4\u00e4\u00d6\u00f6\u00dc\u00fc\u00df+#]/g, ' '); // + und # sind enthalten, da sie z.B. in 'C#' oder 'C++' vorkommen				
				result = result.replace(/ +/g, '\n'); // Leerzeichen durch Zeilenumbrüche ersetzen, um die Wörter line-by-line aufzulisten
				result = result.replace(/(\r\n|\r|\n){2,}/g, ''); // Leere Zeilen entfernen (immer, wenn 2 oder mehr Zeilenumbrüche aufeinander folgen)
				result = result.trim(); // führende und endende Umbrüche entfernen

				fs.writeSync(outputHandle, result); // Wörter zeilenweise der neuen Textdatei hinzufügen
			}
		}
    } finally {
		fs.closeSync(outputHandle);
	}
}

/**
 * erstellt ein JSON-Objekt im Format "word:wordCount"
 * 
 * @param wordlistFile Dateipfad zu einer (mit 'createWordlist()' erstellten) unverarbeiteten Wortliste
 */
function countWords(wordlistFile) {
	let wordCountList={};
	let liner = new lineByLine(wordlistFile);
	let line;
	
	// Zeilen einzeln einlesen und die Wörter zählen
	while(line = liner.next()){
        // wenn das Wort zum ersten Mal vorkommt, dessen wordCount auf 1 setzen, ansonsten um 1 erhöhen.
        wordCountList[line] = (wordCountList[line] ? (wordCountList[line]+1) : 1);
	}
	return wordCountList;
}

/**
 * Sortiert eine als JSON-Objekt übergebene Word-Count-Liste nach der Wörteranzahl und alphabetisch.
 * 
 * @param wordCountList JSON-Objekt im Format "word:wordCount" (erzeugt von 'countWords(wordlistFile)')
 */
function sortWordCountList(wordCountList) {
	let wordCountArray = [];
	// neues Array (zweidimensional) mit Daten des JSON Objektes füllen ( [[wordCount1, word1], [wordCount2, word2], ...] )
	for (let word in wordCountList) {
		wordCountArray.push([wordCountList[word],word]); // [JSON-Wert(0), JSON-Attribut(1)]
	}
	
	// Array absteigend sortieren
	return wordCountArray.sort(function(a,b) {
		if (a[0] === b[0]) { // wenn gleicher word count
            return a[1] < b[1] ? -1 : 1; // alphabetisch sortieren
		} else { // sonst
			return b[0] - a[0]; // absteigend sortieren nach wordCount
		}
    });
}

/**
 * Hauptfunktion zur Erstellung von Word-Count-Listen
 * 
 * @param wordlistFile Dateipfad zu einer (mit 'createWordlist()' erstellten) unverarbeiteten Wortliste
 * @param outputFile Dateipfad der zu erzeugenden Textdatei
 */
export function countAndSortWords(wordlistFile, outputFile) {
	if (!checkFilePath(wordlistFile)) {
		return;
    }
    try {
        let wordCountList = countWords(wordlistFile);
        let sortedWordCountList = sortWordCountList(wordCountList);
        let outputHandle = fs.openSync(outputFile, "a"); 
        for(let entry of sortedWordCountList) {
            fs.writeSync(outputHandle, entry[0] + ' ' + entry[1] + '\n');
        }
        fs.closeSync(outputHandle);
    } finally {
	    console.log(`Eine neue Wordcount-Liste wurde erstellt: ${outputFile}`);
    }
}