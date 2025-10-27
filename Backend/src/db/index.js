const { Pool } = require('pg');
const { createPoolConfig } = require('../config/pool');

const poolConfig = createPoolConfig();
let pool = new Pool(poolConfig);

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

const getPool = () => pool;

const seedDashboardData = async (client) => {
  const toInt = (value) => Number(value) || 0;

  const [{ count: newsCount }] = (
    await client.query('SELECT COUNT(*)::INT FROM campus_news')
  ).rows;
  if (toInt(newsCount) === 0) {
    await client.query(
      `INSERT INTO campus_news (title, summary, body, link, image_url, published_at)
       VALUES
         (
           'Welcome to the New Semester',
           'Key highlights and reminders for the start of term.',
           'Classes are back in session with fresh initiatives from student services and clubs. Explore new workshops and mentorship opportunities launching this month.',
           'https://murdoch.edu.au/news/new-semester',
           'https://murdoch.edu.au/assets/images/news-semester.jpg',
           NOW() - INTERVAL '1 day'
         ),
         (
           'Innovation Hub Opens',
           'A new collaborative makerspace for students.',
           'The Innovation Hub officially opens this week with prototyping labs, XR pods, and mentoring from industry partners. Drop in for daily tours and demos.',
           'https://murdoch.edu.au/news/innovation-hub',
           'https://murdoch.edu.au/assets/images/innovation-hub.jpg',
           NOW() - INTERVAL '3 days'
         )`
    );
  }

  const [{ count: eventsCount }] = (
    await client.query('SELECT COUNT(*)::INT FROM campus_events')
  ).rows;
  if (toInt(eventsCount) === 0) {
    await client.query(
      `INSERT INTO campus_events (title, description, location, start_time, end_time, image_url)
       VALUES
         (
           'Clubs & Societies Expo',
           'Meet student clubs, explore volunteering opportunities, and sign up for upcoming activities.',
           'Student Centre Atrium',
           NOW() + INTERVAL '2 days',
           NOW() + INTERVAL '2 days' + INTERVAL '3 hours',
           'https://murdoch.edu.au/assets/images/clubs-expo.jpg'
         ),
         (
           'Career Networking Night',
           'Connect with alumni mentors and industry partners over light refreshments.',
           'Boola Katitjin Level 2',
           NOW() + INTERVAL '1 week',
           NOW() + INTERVAL '1 week' + INTERVAL '2 hours',
           'https://murdoch.edu.au/assets/images/career-night.jpg'
         )`
    );
  }

  const [{ count: pollsCount }] = (
    await client.query('SELECT COUNT(*)::INT FROM polls')
  ).rows;
  if (toInt(pollsCount) === 0) {
    const pollResult = await client.query(
      `INSERT INTO polls (title, description, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '5 days')
       RETURNING id`,
      [
        'Which upcoming initiative excites you most?',
        'Cast your vote to help us prioritise student-led projects for this semester.'
      ]
    );
    const pollId = pollResult.rows[0]?.id;

    if (pollId) {
      const optionsResult = await client.query(
        {
          text: `INSERT INTO poll_options (poll_id, label)
                 VALUES
                   ($1, $2),
                   ($1, $3),
                   ($1, $4)
                 RETURNING id`,
          values: [
            pollId,
            'Campus sustainability challenge',
            'Mentor matchmaking program',
            'Weekend adventure excursions'
          ]
        }
      );

      const optionIds = optionsResult.rows.map((row) => row.id).filter(Boolean);
      if (optionIds.length > 0) {
        const voteValues = [];
        optionIds.forEach((optionId, index) => {
          const votesForOption = index === 0 ? 5 : index === 1 ? 3 : 2;
          for (let i = 0; i < votesForOption; i += 1) {
            voteValues.push(optionId);
          }
        });

        if (voteValues.length > 0) {
          const valuesPlaceholders = voteValues
            .map((_value, index) => `($1, $${index + 2})`)
            .join(', ');
          await client.query(
            {
              text: `INSERT INTO poll_votes (poll_id, option_id) VALUES ${valuesPlaceholders}`,
              values: [pollId, ...voteValues]
            }
          );
        }
      }
    }
  }

  const [{ count: spotlightsCount }] = (
    await client.query('SELECT COUNT(*)::INT FROM student_spotlights')
  ).rows;
  if (toInt(spotlightsCount) === 0) {
    await client.query(
      `INSERT INTO student_spotlights (
         student_name,
         major,
         class_year,
         achievements,
         quote,
         image_url,
         featured_at
       )
       VALUES
         (
           'Aisha Rahman',
           'Computer Science',
           'Class of 2025',
           'Led the design of an accessible campus navigation app adopted by three faculties.',
           '"Creating inclusive technology starts with listening to lived experiences."',
           'https://murdoch.edu.au/assets/images/spotlight-aisha.jpg',
           NOW() - INTERVAL '5 days'
         ),
         (
           'Lucas Nguyen',
           'Environmental Science',
           'Class of 2024',
           'Coordinated a student sustainability audit that reduced lab waste by 30%.',
           '"Small actions compound into lasting change when we rally together."',
           'https://murdoch.edu.au/assets/images/spotlight-lucas.jpg',
           NOW() - INTERVAL '10 days'
         )`
    );
  }

  const [{ count: rewardCount }] = (
    await client.query('SELECT COUNT(*)::INT FROM reward_points')
  ).rows;
  if (toInt(rewardCount) === 0) {
    await client.query(
      `INSERT INTO reward_points (student_name, points, category)
       VALUES
         ('Team Thrive', 420, 'Clubs & Societies'),
         ('Sustainability Crew', 385, 'Community Impact'),
         ('Innovation Guild', 360, 'Entrepreneurship')`
    );
  }

  const [{ count: calendarCount }] = (
    await client.query('SELECT COUNT(*)::INT FROM calendar_items')
  ).rows;
  if (toInt(calendarCount) === 0) {
    await client.query(
      `INSERT INTO calendar_items (
         title,
         description,
         start_time,
         end_time,
         location,
         category,
         link
       )
       VALUES
         (
           'Leadership Workshop',
           'Interactive session on facilitation and conflict resolution.',
           NOW() + INTERVAL '4 days',
           NOW() + INTERVAL '4 days' + INTERVAL '2 hours',
           'Hill Lecture Theatre',
           'Workshop',
           'https://murdoch.edu.au/events/leadership-workshop'
         ),
         (
           'Semester census date',
           'Last day to make enrolment changes without academic penalty.',
           NOW() + INTERVAL '12 days',
           NOW() + INTERVAL '12 days' + INTERVAL '1 hour',
           NULL,
           'Important date',
           'https://murdoch.edu.au/calendars/sem1-census'
         )`
    );
  }
};

const createDatabaseIfMissing = async () => {
  if (process.env.DATABASE_URL) {
    throw new Error('Automatic database creation is not supported when using DATABASE_URL.');
  }

  const targetDb = poolConfig.database;
  if (!targetDb) {
    throw new Error('PGDATABASE must be specified when DATABASE_URL is not set.');
  }

  const adminDatabase = process.env.PGROOT_DB || 'postgres';
  const adminPool = new Pool({ ...poolConfig, database: adminDatabase });

  try {
    await adminPool.query(`CREATE DATABASE ${quoteIdentifier(targetDb)}`);
    console.info(`Created missing database "${targetDb}" using admin database "${adminDatabase}".`);
  } catch (error) {
    if (error.code === '42P04') {
      console.info(`Database "${targetDb}" already exists. Continuing.`);
      return;
    }
    throw error;
  } finally {
    await adminPool.end();
  }
};

const ensureDatabase = async () => {
  try {
    const client = await pool.connect();
    try {
      await client.query(
        `CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          role TEXT NOT NULL,
          first_name TEXT,
          last_name TEXT,
          email TEXT NOT NULL UNIQUE,
          personal_email TEXT,
          student_id TEXT,
          phone TEXT,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      );

      await client.query(
        `ALTER TABLE users
           ADD COLUMN IF NOT EXISTS personal_email TEXT`
      );

      await client.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS users_personal_email_uniq
           ON users (personal_email)
           WHERE personal_email IS NOT NULL`
      );

      await client.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS users_student_id_uniq
           ON users (student_id)
           WHERE student_id IS NOT NULL`
      );
      
      await client.query(
        `CREATE TABLE IF NOT EXISTS user_login_history (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          ip_address TEXT,
          user_agent TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      );

      await client.query(
        `CREATE TABLE IF NOT EXISTS user_consent (
          id SERIAL PRIMARY KEY,
          user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          session_token TEXT UNIQUE,
          essential BOOLEAN NOT NULL DEFAULT TRUE,
          analytics BOOLEAN NOT NULL DEFAULT FALSE,
          email BOOLEAN NOT NULL DEFAULT FALSE,
          payment BOOLEAN NOT NULL DEFAULT FALSE,
          ai BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT user_consent_identity CHECK (user_id IS NOT NULL OR session_token IS NOT NULL)
        )`
      );

      await client.query(
        `CREATE INDEX IF NOT EXISTS user_login_history_user_id_idx
         ON user_login_history (user_id)`
      );

      await client.query(
        `CREATE INDEX IF NOT EXISTS user_login_history_user_id_created_at_idx
         ON user_login_history (user_id, created_at DESC)`
      );

await client.query(
        `CREATE TABLE IF NOT EXISTS campus_news (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          summary TEXT,
          body TEXT,
          link TEXT,
          image_url TEXT,
          published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      );

      await client.query(
        `CREATE TABLE IF NOT EXISTS campus_events (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          location TEXT,
          start_time TIMESTAMPTZ NOT NULL,
          end_time TIMESTAMPTZ,
          image_url TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      );

      await client.query(
        `CREATE TABLE IF NOT EXISTS polls (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          expires_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      );

      await client.query(
        `CREATE TABLE IF NOT EXISTS poll_options (
          id SERIAL PRIMARY KEY,
          poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
          label TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      );

      await client.query(
        `CREATE TABLE IF NOT EXISTS poll_votes (
          id SERIAL PRIMARY KEY,
          poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
          option_id INTEGER NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      );

      await client.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS poll_votes_unique_user_poll_idx
           ON poll_votes (poll_id, user_id)
           WHERE user_id IS NOT NULL`
      );

      await client.query(
        `CREATE TABLE IF NOT EXISTS student_spotlights (
          id SERIAL PRIMARY KEY,
          student_name TEXT NOT NULL,
          major TEXT,
          class_year TEXT,
          achievements TEXT,
          quote TEXT,
          image_url TEXT,
          featured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      );

      await client.query(
        `CREATE TABLE IF NOT EXISTS reward_points (
          id SERIAL PRIMARY KEY,
          student_name TEXT NOT NULL,
          points INTEGER NOT NULL,
          category TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      );

      await client.query(
        `CREATE TABLE IF NOT EXISTS calendar_items (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          start_time TIMESTAMPTZ NOT NULL,
          end_time TIMESTAMPTZ,
          location TEXT,
          category TEXT,
          link TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      );

      await client.query(
        `CREATE INDEX IF NOT EXISTS campus_events_start_time_idx
           ON campus_events (start_time)`
      );

      await client.query(
        `CREATE INDEX IF NOT EXISTS calendar_items_start_time_idx
           ON calendar_items (start_time)`
      );

      await seedDashboardData(client);
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.code === '3D000' && !process.env.DATABASE_URL) {
      console.warn(
        `Database "${poolConfig.database}" was not found. Attempting to create it via admin database "${process.env.PGROOT_DB || 'postgres'}"...`
      );
      await createDatabaseIfMissing();
      await pool.end().catch(() => {});
      pool = new Pool(poolConfig);
      await ensureDatabase();
      return;
    }

    if (error.code === '28P01') {
      console.error(
        'PostgreSQL rejected the supplied credentials. Verify PGUSER/PGPASSWORD or adjust local trust authentication settings.'
      );
    }

    throw error;
  }
};

module.exports = {
  getPool,
  ensureDatabase
};
