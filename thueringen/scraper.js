var scrapyard = require("scrapyard");
var cheerio = require('cheerio');
var fs = require('fs');
var request = require('request');

var scraper = new scrapyard({
    debug: true,
    retries: 5,
    connections: 1,
    timeout: 300000,
    cache: './storage',
    bestbefore: "200min"
});

function scrape(url, method = 'GET', formdata) {
    return new Promise(function(fulfill, reject) {
        scraper({
            url: url,
            type: 'html',
            method: method,
            form: formdata,
            jar:true
        }, function(err, $) {
            if (err) {
                reject(err);
            }
            else {
                fulfill($);
            }
        });
    });
}

function getListOfSchools() {
    console.log('getting All Schools');
    return new Promise(function(fulfill, reject) {
        scrape('https://www.schulportal-thueringen.de/tip/schulportraet_suche/search.action?tspi=&tspm=&vsid=none&mode=&extended=0&anwf=schulportraet&freitextsuche=&name=&schulnummer=&strasse=&plz=&ort=&schulartDecode=&schulamtDecode=&schultraegerDecode=&sortierungDecode=Schulname&rowsPerPage=999&schulartCode=&schulamtCode=&schultraegerCode=&sortierungCode=10&uniquePortletId=portlet_schulportraet_suche_WAR_tip_LAYOUT_10301')
            .then(function ($) {

                var rows = $('table .tispo_row_normal, table .tispo_row_odd').get();
                var keys = $('th').get().map((key) => $(key).text().trim().toLowerCase());
                var schools = rows.map((row) => {
                    var cells = $(row).find('td').get();
                    var entries = cells.map((cell) => {
                        return $(cell).text()
                    });
                    var school = entries.reduce((prev, entry, index) => {
                        var key = keys[index];
                        prev[key] = entry.replace(/[\t\n\r]/g, '');
                        return prev
                    }, {});
                    school['url'] = $(row).find('a').attr('href').split('?')[1];
                    return school;
                });
                console.log('parsed all Schools');
                fulfill(schools);

        })
    })
}

function scrapeAllSchools(schools) {
    console.log('start scraping All schools');
    var schoolPromises = schools.map((school) => {
        return scrapeSchoolInformation(school)
            .then(function(data) {
                writeSchoolInformation(data[0]);
                return data;
            })
    });
    return Promise.all(schoolPromises);
}

function writeSchoolInformation(schooldata) {
    return new Promise(function(fulfill, reject) {
        fs.writeFile(__dirname + '/output/' + schooldata.AufeinenBlick.schulnummer + '.json', JSON.stringify(schooldata), {encoding: 'utf-8',flag: 'w+'}, function (err) {
            if (err) {
                reject(err)
            }
            else (
                fulfill(schooldata)
            )
        })
    })

}

function scrapeSchoolInformation(schooldata) {
    console.log('parsing ' + schooldata.schulname);
    return Promise.all([scrapeGeneralInformation(schooldata.url), scrapeStaffRessources(schooldata.url), scrapeFactualRessources(schooldata.url)]);
}

function scrapeGeneralInformation(id) {
    return scrape('https://www.schulportal-thueringen.de/web/guest/schools/overview?' + id)
        .then(getBlocks)
        .then(function(data) {
            data['AufeinenBlick'] = {
                stammdaten: parseKeyValueTable(cheerio(data['AufeinenBlick']).find('#schulportraet_ueberblick_detail_allgemein_stammdaten table')),
                schulnummer:  parseInt(cheerio(data['AufeinenBlick']).find('.tispo_la_small').text().replace(/\D+/g, '')),
                adresse : cheerio(data['AufeinenBlick']).find('.tispo_la_small').next().text().trim(),
                leitbild : cheerio(data['AufeinenBlick']).find('.tispo_htmlUserContent').text()
            };
            data['Aktuelles'] = cheerio(data['Aktuelles']).find('.tispo_cn_noData').text();
            data['InhaltlicheSchwerpunkte'] = cheerio(data['InhaltlicheSchwerpunkte']).find('li').get().map((item) => {return {name: cheerio(item).text(), link: cheerio(item).find('a').attr('href')}})
            data['Dokumente/Links'] = cheerio(data['Dokumente/Links']).find('.tispo_ln_tsp').html();
            delete data['Ξ'];
            return data;
        })
}

function scrapeStaffRessources(id) {
    return scrape('https://www.schulportal-thueringen.de/web/guest/schools/personal_resources?' + id)
        .then(getBlocks)
        .then(function(data) {
            console.log(data);
            data['PersonenmitbesonderenFunktionen/Aufgaben'] = {
                Schulleitung :  parseKeyValueTable(cheerio(data['PersonenmitbesonderenFunktionen/Aufgaben']).find('.tispo_cn_headBodyTable'))
            }
            data['Statistik'] = parseTable(cheerio(data['Statistik']).find('.tispo_matrixlist'));
            data['Dokumente/Links'] = cheerio(data['Dokumente/Links']).find('.tispo_ln_tsp').html();
            delete data['Ξ'];
            return data;
        })
}

function scrapeFactualRessources(id) {
    return scrape('https://www.schulportal-thueringen.de/web/guest/schools/neuter_resources?' + id)
        .then(getBlocks)
        .then(function(data) {
            var sectionsFactualRessources = cheerio(data['SächlicheRessourcen']).find('.tispo_cn_groupHeading').children();
            sectionsFactualRessources = sectionsFactualRessources.reduce(function(prev, curr) {
                curr = cheerio(curr);
                if (curr.name == 'div')
                    prev[curr.]
            }, {});
            console.log(data);
        })
}

function getBlocks($) {
    var blocks = $('#column-2,#column-3');
    var headers = $(blocks).find('#content .portlet-title-text').get().map((header) => {
        return $(header).text().replace(/\s/g, '');
    });
    var values = $(blocks).find('#content .portlet-body').get();
    return headers.reduce((prev, header, index) => {
        prev[header] = values[index];
        return prev;
    }, {});
}

function parseContent($) {

}

function parseKeyValueTable(table) {
    var keys = cheerio(table).find('td.tispo_cn_label').get().reduce((prev, key) => {
        var text = cheerio(key).text();
        if (text.length > 0)
            prev.push(text);
        return prev;
    }, []);
    var values = cheerio(table).find('td.tispo_cn_value').get().map((value) => {
        var text = cheerio(value).text();
        if (cheerio(value).find('a span').length > 0)
            text = decryptZD(cheerio(value).find('a span').text());
        return text;
    });
    return keys.reduce((prev, curr, index) => {
        prev[curr] = values[index].trim();
        return prev;
    }, {});

}

function parseTable(table) {
    var table = cheerio(table);
    var rows = table.find('tr').get();
    var keys = cheerio(rows[0]).find('th').get().map((cell) => cheerio(cell).text().replace(/\\n/g, '').trim().replace(/\s/g, '_'));
    var valueRows = rows.slice(1);
    var values = valueRows.map((row) => {
        return cheerio(row).find('td').get().map((cell) => {
            // Case 1: text
            var text = cheerio(cell).text().trim();
            if (text) {
                return text
            }
        });
    });
    return values.map((row) => {
        return row.reduce((acc, elem, index) => {
            acc[keys[index]] = elem;
            return acc;
        }, {})
    });
}

//Decryption of email address
function decryptZD(a) {
    result = "";
    a = a.replace(/ /g, "");
    a = a.replace(/#3b/, "");
    a = a.replace(/3e#/, "");
    a = a.replace(/o/g, "");
    lastValue = 0;
    currentValue = 0;
    for (i = 0; i < a.length; i++) {
        if (isNaN(a.charAt(i))) {
            currentValue = (a.charCodeAt(i) - 97) + 10
        } else {
            currentValue = a.charAt(i)
        }
        if (i % 2 == 1) {
            result += String.fromCharCode(parseInt((parseInt(lastValue * 23) + parseInt(currentValue)) / 2))
        }
        lastValue = currentValue
    }
    return result
}

getListOfSchools()
    .then(scrapeAllSchools)
    .catch(console.log);


// var file = 'data.json';
//

//
// var base_url = "https://schuldatenbank.sachsen.de/index.php";
//
// function scrape(url, method = 'GET', formdata) {
//     return new Promise(function(fulfill, reject) {
//         scraper({
//             url: url,
//             type: 'html',
//             method: method,
//             form: formdata,
//             jar:true
//         }, function(err, $) {
//             if (err) {
//                 reject(err);
//             }
//             else {
//                 fulfill($);
//             }
//         });
//     });
// }
//
// function getMainPage() {
//     return scrape('https://www.schulportal-thueringen.de/schools')
// }
//
// function getSchoollist() {
//     scrape('https://www.schulportal-thueringen.de/tip/schulportraet_suche/search.action?tspi=&tspm=&vsid=none&mode=&extended=0&anwf=schulportraet&freitextsuche=&name=&schulnummer=&strasse=&plz=&ort=&schulartDecode=&schulamtDecode=&schultraegerDecode=&sortierungDecode=Schulname&rowsPerPage=20&schulartCode=&schulamtCode=&schultraegerCode=&sortierungCode=10&uniquePortletId=portlet_schulportraet_suche_WAR_tip_LAYOUT_10301', 'POST', {
//         vsid: 'none',
//         extended:0,
//         anwf: 'schulportraet',
//         sortierungDecode: 'Schulname',
//         rowsPerPage: 999,
//         sortierungCode: 10,
//         uniquePortletId: 'portlet_schulportraet_suche_WAR_tip_LAYOUT_10301',
//         ajaxid: 'schulportraet_suche_results'
//     }).then(function(data) {
//         var html = $(data);
//         console.log(html);
//     })
// }
//
// getMainPage()
//    .then(getSchoollist);