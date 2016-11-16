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

//get the cookie
function getMainpage() {
    return new Promise(function(fulfill, reject) {
        scraper({
            url: 'https://schuldatenbank.sachsen.de/index.php?id=2',
            type: 'html',
            method: 'GET',
            jar: true
        }, function(err, $) {
            if (err) reject(err);
            else fulfill();
        });
    });
}

function getSchoolpage() {
    return new Promise(function(fulfill, reject) {
        scraper({
            url: 'https://schuldatenbank.sachsen.de/index.php?id=25',
            type: 'html',
            method: 'POST',
            form: {
                feld1:'01',
                bedingung:'and',
                feld2:'02',
                weiter:'suchen'
            },
            jar: true
        }, function(err, $) {
            if (err) reject(err);
            else fulfill($);
        });
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
    return new Promise((fulfill, reject) => {
        scraper({
            url: 'https://schuldatenbank.sachsen.de/index.php?id=420', //+ informationDictionary.potrait,
            type: 'html',
            method: 'POST',
            jar: true,
            form: schooldata
        }, (err, $) => {
            console.log(schooldata);
            if (err) reject(err);
            else fulfill($);
        });
    });
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
    return new Promise(function(fulfill, reject) {
        scraper({
            url: 'https://schuldatenbank.sachsen.de/index.php?id='+ informationDictionary.potrait,
            type: 'html',
            method: 'POST',
            form: schooldata,
            jar: true
        }, function(err, $) {
            if (err) reject(err);
            else {
                var portrait = $('.kontaktliste').find('li').get().reduce((prev, entry, index) => {
                    var result =  $(entry).text().split(':');
                    var key = result[0].replace(/\s/g, '_').toLowerCase();
                    var value = result.slice(1).join(':');
                    prev[key] = value;
                    return prev;
                }, {});
                portrait['mission'] = $('#quickbar > .box li').text();
                fulfill(portrait);
            }
        });
    })
}

function scrapeStudents() {
    return new Promise(function(fulfill, reject) {
        var  url = 'https://schuldatenbank.sachsen.de/index.php?id=' + informationDictionary.students;
        scraper({
            url: url,
            type: 'html',
            method: 'GET',
            jar: true
        }, function (err, $) {
            if (err) reject(err);
            else {
                var years = $('form option').get();
                years = years.map((elem) => elem.attribs.value);
                var tables = years.map((year) => {
                    scraper({
                        url:url,
                        type: 'html',
                        method: 'POST',
                        form: {'jahr' : year},
                        jar: true
                    }, function(err, $) {
                        var tables = $('table');
                        var tableClasses = tables.first();
                        var tableLanguage = tables.get(1);

                        //Parse Classes Table
                        var keyrow = tableClasses.find('tr').first();
                        var keys = keyrow.find('td').get().map((cell) => $(cell).text().replace(/\\n/g, '').trim());
                        var valueRows = tableClasses.find('tr').not(':first').get();
                        var values = valueRows.map((row) => {
                            $(row).find('td').map((cell) => $(cell).text());
                        });
                        console.log(year);
                        console.log('keys');
                    })
                })
            }
        });
    });
}

function scrapeTable(table) {

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
