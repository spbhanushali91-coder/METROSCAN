const bcrypt = require('bcryptjs');
const db = require('./init');

const manufacturers = [
  {
    username: 'manufacturer1',
    password: 'manufacturer123',
    displayName: 'Manufacturer One'
  },
  {
    username: 'manufacturer2',
    password: 'manufacturer123',
    displayName: 'Manufacturer Two'
  },
  {
    username: 'manufacturer3',
    password: 'manufacturer123',
    displayName: 'Manufacturer Three'
  },
  {
    username: 'manufacturer4',
    password: 'manufacturer123',
    displayName: 'Manufacturer Four'
  },
  {
    username: 'manufacturer5',
    password: 'manufacturer123',
    displayName: 'Manufacturer Five'
  }
];

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users
    (username, password_hash, display_name, role)
  VALUES (?, ?, ?, ?)
`);

for (const manufacturer of manufacturers) {
  const passwordHash = bcrypt.hashSync(manufacturer.password, 10);

  insertUser.run(
    manufacturer.username,
    passwordHash,
    manufacturer.displayName,
    'MANUFACTURER'
  );
}

console.log('✅ Manufacturer seed completed.');

const rows = db.prepare(`
  SELECT id, username, display_name, role
  FROM users
  WHERE role = 'MANUFACTURER'
  ORDER BY id
`).all();

console.table(rows);