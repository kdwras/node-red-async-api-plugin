const {Parser: AsyncApiParser} = require('@asyncapi/parser');
const fs = require('fs');

async function getParsedAsyncApiFile(data) {

    // Read the AsyncAPI file

    try {
        const parser = new AsyncApiParser();


        const errors = await parser.validate(data);

        if (errors.length) {
            console.error('❌ Validation errors found:');
            errors.forEach((error, index) => {
                console.error(`${index + 1}. ${error.message} (at ${error.location.pointer})`);
            });
            return;
        }

        const ret = await parser.parse(data);

        console.log('✅ AsyncAPI document is valid!');
      //  console.log('Parsed Document:', ret);

        return ret;

    } catch (error) {
        console.error('Error reading or parsing the file:', error);
    }
}


module.exports = getParsedAsyncApiFile;
