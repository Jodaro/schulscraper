var scrapyard = require("scrapyard");
var $ = require('cheerio');

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
                    reject(new Error('Error detected'));
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
                res.push(result);
                return res;
            });
        });
    }, Promise.resolve([]));
}

function setActiveSchool(schooldata) {
    return scrape('https://schuldatenbank.sachsen.de/index.php?id=420', 'POST', schooldata);
}


function scrapeSchool(schooldata) {
    //Set Active School
    return scrapePotrait(schooldata)
    .then(function(data) {
        var scrapeArray = [];
        scrapeArray.push(scrapeStudents());
        return Promise.all(scrapeArray);
    })
    .then(function(data) {
        // TODO: Merge Data into reasonable Data Format
        console.log(data)
    });
}

function scrapePotrait(schooldata) {
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

function scrapeStudents() {
    var url = 'https://schuldatenbank.sachsen.de/index.php?id=' + informationDictionary.students;
    return scrape(url)
        .then(function($) {
            var years = $('form option').get().map((elem) => elem.attribs.value);
            var requests = years.map((year) => {
                return scrape(url, "POST", {jahr: year})//, 'POST', {jahr : year})
                    .then(function($) {
                        var sections = $('#content h2').get().map((section) => {
                            var key = $(section).text();
                            var value = $(section).next('table').get();
                            return {description: key, table:value};
                        });
                        sections = sections.map((section) => {
                            section.table = parseTable(section.table);
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
            }).then(function(data) {
                console.log(data);
            });
        });
}

function parseTable(table) {
    var table = $(table);
    var rows = table.find('tr').get();
    var keys = $(rows[0]).find('td').get().map((cell) => $(cell).text().replace(/\\n/g, '').trim().replace(/\s/g, '_'));
    var valueRows = rows.slice(1);
    var values = valueRows.map((row) => {
        return $(row).find('td').get().map((cell) => $(cell).text());
    });

    var table = values.map((row) => {
        return row.reduce((acc, elem, index) => {
            acc[keys[index]] = elem;
            return acc;
        }, {})
    })
    console.log(table);
    return table;
}

function scrapeMultiValuePage(scrape) {

}

getMainpage()
    .then(getSchoolpage)
    .then(getScrapeDataForSchools)
    .then(scrapeAllSchools)
    .then(function(data) {
        console.log(data);
    })
    .catch(console.log);
