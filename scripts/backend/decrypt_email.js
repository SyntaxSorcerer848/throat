let crypto = require('crypto');

let CIPHER_ALGORITHM = 'aes-256-gcm';
let IV_LENGTH = 16;
let TAG_LENGTH = 16;
let SALT_LENGTH = 64;
let ITERATIONS = 10000;

let tagPosition = SALT_LENGTH + IV_LENGTH;
let encryptedPosition = tagPosition + TAG_LENGTH;

let getKey = (salt, secret) => {
    return crypto.pbkdf2Sync(secret, salt, ITERATIONS, 32, 'sha256');
};

let gcm = {
    encrypt: (input, secret) => {
        let iv = crypto.randomBytes(IV_LENGTH);
        let salt = crypto.randomBytes(SALT_LENGTH);

        let AES_KEY = getKey(salt, secret);

        let cipher = crypto.createCipheriv(CIPHER_ALGORITHM, AES_KEY, iv);
        let encrypted = Buffer.concat([cipher.update(String(input), 'utf8'), cipher.final()]);

        let tag = cipher.getAuthTag();

        return Buffer.concat([salt, iv, tag, encrypted]).toString('hex');
    },

    decrypt: (input, secret) => {
        let inputValue = Buffer.from(String(input), 'hex');
        let salt = inputValue.subarray(0, SALT_LENGTH);
        let iv = inputValue.subarray(SALT_LENGTH, tagPosition);
        let tag = inputValue.subarray(tagPosition, encryptedPosition);
        let encrypted = inputValue.subarray(encryptedPosition);

        let key = getKey(salt, secret);

        let decipher = crypto.createDecipheriv(CIPHER_ALGORITHM, key, iv);

        decipher.setAuthTag(tag);

        return decipher.update(encrypted) + decipher.final('utf8');
    },
};

// Usage: `node scripts/backend/descrypt_email.js`
// Uncomment below to use a gcm function
// console.log(
//     'Decrypt email',
//     gcm.decrypt(
//         '', //
//         process.env.AES_ENCRYPTION_SECRET
//     )
// );
