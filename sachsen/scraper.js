var scrapyard = require("scrapyard");
var $ = require('cheerio');
var fs = require('fs');

var file = 'data.json';

var scraper = new scrapyard({
    debug: true,
    retries: 5,
    connections: 1,
    //cache: './storage',
    bestbefore: "5min"
});

var informationDictionary = {
    potrait: '420',
    students: '430',
    staff_ressources: '440',
    factual_ressources: '450',
    learning: '460',
    events: '470',
    individual_facilitation: '480',
    working_groups: '490',
    quality: '500',
    cooperation: '510',
    success: '520'
};

var base_url = "https://schuldatenbank.sachsen.de/index.php";

function responseIsValid($) {
    return $('#content h2').text() !== "Es ist ein Fehler aufgetreten";
}

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
                if (responseIsValid($))
                    fulfill($);
                else {
                    reject(err);
                }
            }
        });
    });
}

//get the cookie
function getMainpage() {
    return scrape(base_url + '?id=2');
}

function getSchoolpage() {
    return scrape(base_url +'?id=25', 'POST', {
            feld1:"01",
            begriff1:"",
            bedingung:"and",
            begriff2:"",
            feld2:"02",
            weiter:"suchen"
    });
}

function getScrapeDataForSchools($) {
    var forms = Object.values($('.ssdb_02 form'));
    var schools = forms.map((item) => {
            var metadata = $(item).serializeArray();
    var result = {};
    for (var i = 0; i < metadata.length; i++) {
        var curr = metadata[i];
        result[curr.name] = curr.value;
    }
    result['weg'] = '';
    return result;
});
    return schools;
}

function scrapeAllSchools(schools) {
    return schools.reduce(function(acc,curr) {
        return acc.then(function(res) {
            return scrapeSchool(curr).then(function(result) {
                //res.push(result);
                //return res;
                console.log('finished');
            }).catch(function(err) {
                console.log('Error cathed');
                //return res;
            });
        });
    }, Promise.resolve([]));
}

function setActiveSchool(schooldata) {
    return scrape('https://schuldatenbank.sachsen.de/index.php?id=420', 'POST', schooldata);
}


function scrapeSchool(schooldata) {
    //Set Active School
    console.log('scraping ' + schooldata.bez);
    return scrapePortrait(schooldata)
    .then(function(data) {
        var scrapeArray = [data, scrapeStudents(), scrapeStaffResources(), scrapeFacturalResources(), scrapeTeachAndLearn(),
            scrapeSchoolRoutine(), scrapeIndividualFacilitation(), scrapeProfessionality(), scrapeQuality(), scrapeCooperation(),
            scrapeEducationSuccess()
        ];
        return Promise.all(scrapeArray);
    })
    .then(function(data) {

        fs.writeFile(__dirname + '/output/' + schooldata.bez.replace(/[\\/\\.]/g, '').replace(/\s/g,"_") + '.json', JSON.stringify(data), {encoding: 'utf-8',flag: 'w+'}, function (err) {
            console.error(err)

        })
    })
}

function scrapePortrait(schooldata) {
    return scrape('https://schuldatenbank.sachsen.de/index.php?id='+ informationDictionary.potrait, 'POST', schooldata)
        .then(function($) {
            var portrait = $('.kontaktliste').find('li').get().reduce((prev, entry, index) => {
                var result =  $(entry).text().split(':');
                var key = result[0].replace(/\s/g, '_').toLowerCase();
                var value = result.slice(1).join(':');
                prev[key] = value;
                return prev;
            }, {});
            portrait['mission'] = $('#quickbar > .box li').text();
            return portrait;
        });
}

function getSections($) {

    var sections = $('#content h2').length > 0 ? $('#content h2') : $('#content h3')

    return $(sections).get().map((section) => {
        var key = $(section).text();
        var entries = $(section).nextUntil('h2').get();
        var sourcetext = undefined;
        var lastEntry = entries.pop();
        if ($(lastEntry).hasClass('small')) {
            sourcetext = $(lastEntry).text();
        } else {
            entries.push(lastEntry);
        }

        var result = {description: key, entries:entries};
        if (sourcetext) {
            result.source = sourcetext
        }
        return result
    });

}

function scrapeStudents() {
    var url = 'https://schuldatenbank.sachsen.de/index.php?id=' + informationDictionary.students;
    return scrape(url)
        .then(function($) {
            var years = $('form option').get().map((elem) => elem.attribs.value);
            var requests = years.map((year) => {
                return scrape(url, "POST", {jahr: year})//, 'POST', {jahr : year})
                    .then(function($) {
                        var sections = getSections($);
                        sections = sections.map((section) => {
                            section.entries = parseTable(section.entries);
                            return section;
                        });
                        return sections;
                    });
            });

            return Promise.all(requests).then(function(tables) {
                return tables.reduce((acc, table, index) => {
                    acc[years[index]] = table;
                    return acc;
                }, {});
            })
        });
}

function scrapeStaffResources() {
    var url = base_url + '?id=' + informationDictionary.staff_ressources;
    return scrape(url)
        .then(getSections)
        .then(parseSections)
}

function scrapeFacturalResources() {
    var url = base_url + '?id=' + informationDictionary.factual_ressources;
    return scrape(url)
        .then(getSections)
        .then(parseSections)
}

function scrapeTeachAndLearn() {
    var url = base_url + '?id=' + informationDictionary.learning;
    return scrape(url)
        .then(getSections)
        .then(parseSections)
}

function scrapeSchoolRoutine() {
    var url = base_url + '?id=' + informationDictionary.events;
    return scrape(url)
        .then(getSections)
        .then(parseSections)
}

function scrapeIndividualFacilitation() {
    var url = base_url + '?id=' + informationDictionary.individual_facilitation;
    return scrape(url)
        .then(getSections)
        .then(parseSections)
}

function scrapeProfessionality() {
    var url = base_url + '?id=' + informationDictionary.working_groups;
    return scrape(url)
        .then(getSections)
        .then(parseSections)
}

function scrapeQuality() {
    var url = base_url + '?id=' + informationDictionary.quality;
    return scrape(url)
        .then(getSections)
        .then(parseSections)
}

function scrapeCooperation() {
    var url = base_url + '?id=' + informationDictionary.cooperation;
    return scrape(url)
        .then(getSections)
        .then(parseSections)
}

function scrapeEducationSuccess() {
    var url = base_url + '?id=' + informationDictionary.success;
    return scrape(url)
        .then(getSections)
        .then(parseSections)
}

function parseSections(sections) {
    return sections.map((section) => {
        section.parsedData = section.entries.map((entry) => {
            if (entry) {
                entry = parseSectionEntry(entry);
                return entry
            }
        });
        delete section.entries;
        return section;
    })
}

function parseSectionEntry(entry) {
    switch(entry.name) {
        case 'table':
            return parseTable(entry);
            break;
        case 'p' :
            return $(entry).text();
            break;
        case 'ul' :
            return parseList(entry);
            break;
        default:
            //console.log('Unhandled Section Type "' + entry.name + '" detected');
            break;
    }
}

function parseTable(table) {
    var table = $(table);
    var rows = table.find('tr').get();
    var keys = $(rows[0]).find('td').get().map((cell) => $(cell).text().replace(/\\n/g, '').trim().replace(/\s/g, '_'));
    var valueRows = rows.slice(1);
    var values = valueRows.map((row) => {
        return $(row).find('td').get().map((cell) => {
            // Case 1: text
            var text = $(cell).text().trim();
            if (text) {
                return text
            }
            //Case 2: Image
            var img = $(cell).find('img')
            if (img) {
                if ($(img).attr('alt')) {
                    return $(img).attr('alt')
                } else {
                    return $(img).attr('src')
                }
            }
            //Case 3: button
            // var form = $(cell).find('form');
            // if (form) {
            //     var fields = $(form).find('input');
            //     var url = $(form).attr('action').split('?')[1];
            //     var formdata = fields.reduce((prev, field) => {
            //         prev[$(field).attr('name')] = $(field).attr('value');
            //     }, {});
            //     var subdata = scrape(base_url + url, 'POST', formdata)
            //         .then(function(data) {
            //             console.log(data);
            //         })
            // }


        });
    });

    var table = values.map((row) => {
        return row.reduce((acc, elem, index) => {
            acc[keys[index]] = elem;
            return acc;
        }, {})
    })
    //console.log(table);
    return table;
}

function parseList(list) {
    var entries = $(list).find('li').get();
    var parsed = entries.map(function(el) {
        return $(el).text();
    });
    return parsed;
}

getMainpage()
    .then(getSchoolpage)
    .then(getScrapeDataForSchools)
    .then(scrapeAllSchools)
    .catch(console.log);
