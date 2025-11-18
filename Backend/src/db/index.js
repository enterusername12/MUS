const { Pool } = require('pg');
const { createPoolConfig } = require('../config/pool');

const poolConfig = createPoolConfig();
let pool = new Pool(poolConfig);

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;
const getPool = () => pool;

/* ------------------ SEEDING FUNCTIONS ------------------ */

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

  const [{ count: userCalendarCount }] = (
    await client.query('SELECT COUNT(*)::INT FROM user_calendar_items')
  ).rows;

  if (toInt(userCalendarCount) === 0) {
    await client.query(
      `INSERT INTO user_calendar_items (
         user_id,
         source_type,
         source_id,
         title,
         date,
         time,
         category
       )
       SELECT
         users.id,
         'orientation',
         1,
         'Orientation Week Prep',
         (NOW() + INTERVAL '7 days')::DATE,
         TO_CHAR(NOW() + INTERVAL '7 days', 'HH24:MI:SS'),
         'reminder'
       FROM users
       WHERE users.id IS NOT NULL
       ORDER BY users.id
       LIMIT 1`
    );
  }
};

/* ---------- NEW: SEED MERCHANDISE DATA ---------- */
const seedMerchandiseData = async (client) => {
  const { rows } = await client.query(`SELECT COUNT(*) AS count FROM merch_products`);
  if (Number(rows[0]?.count || 0) > 0) return;

  const products = [
  {
      name: 'Campus Guide Book',
      sku: 'MU-CAMPUS-GUIDE',
      description: 'Essential guide for new students with maps and resources.',
      category: 'Books',
      price: 12.99,
      stockQty: 150,
      isFeatured: false,
      imageUrl: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'University Hoodie',
      sku: 'MU-HOODIE',
      description: 'Warm pullover with Murdoch logo.',
      category: 'Apparel',
      price: 49.0,
      stockQty: 80,
      isFeatured: true,
      imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Event Ticket',
      sku: 'MU-EVENT-TICKET',
      description: 'Access to annual campus festival and activities.',
      category: 'Tickets',
      price: 25.0,
      stockQty: 200,
      isFeatured: false,
      imageUrl: 'https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Enamel Pin',
      sku: 'MU-ENAMEL-PIN',
      description: 'Collectible enamel pin.',
      category: 'Accessories',
      price: 6.5,
      stockQty: 300,
      isFeatured: false,
      imageUrl: 'https://images.unsplash.com/photo-1475180098004-ca77a66827be?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Stationery Set',
      sku: 'MU-STATIONERY-SET',
      description: 'Notebook and pen set.',
      category: 'Stationery',
      price: 9.75,
      stockQty: 250,
      isFeatured: false,
      imageUrl: 'https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Campus Tote Bag',
      sku: 'MU-TOTE-BAG',
      description: 'Canvas tote with MU print.',
      category: 'Accessories',
      price: 15.0,
      stockQty: 120,
      isFeatured: true,
      imageUrl: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=600&q=80'
    }
  ];

  for (const product of products) {
    await client.query(
      `INSERT INTO merch_products (
         name, sku, description, category, price, stock_qty, image_url,
         is_active, is_featured, created_at, updated_at
       )
        VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, NOW(), NOW())
       ON CONFLICT (sku) DO NOTHING`,
            [
        product.name,
        product.sku,
        product.description,
        product.category,
        product.price,
        product.stockQty,
        product.imageUrl,
        product.isFeatured
      ]
    );
  }
};

/* ------------------ DATABASE CREATION ------------------ */

const createDatabaseIfMissing = async () => {
  if (process.env.DATABASE_URL) {
    throw new Error('Automatic database creation is not supported when using DATABASE_URL.');
  }

  const targetDb = poolConfig.database;
  if (!targetDb) throw new Error('PGDATABASE must be specified when DATABASE_URL is not set.');

  const adminDatabase = process.env.PGROOT_DB || 'postgres';
  const adminPool = new Pool({ ...poolConfig, database: adminDatabase });

  try {
    await adminPool.query(`CREATE DATABASE ${quoteIdentifier(targetDb)}`);
    console.info(`Created missing database "${targetDb}".`);
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

/* ------------------ ENSURE DATABASE STRUCTURE ------------------ */

const ensureDatabase = async () => {
  try {
    const client = await pool.connect();
    try {
      // users
      await client.query(`CREATE TABLE IF NOT EXISTS users (
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
      )`);

      // user_login_history
      await client.query(`CREATE TABLE IF NOT EXISTS user_login_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);

      // user_consent
      await client.query(`CREATE TABLE IF NOT EXISTS user_consent (
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
      )`);

      // campus_news
      await client.query(`CREATE TABLE IF NOT EXISTS campus_news (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        summary TEXT,
        body TEXT,
        link TEXT,
        image_url TEXT,
        published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);

      // competition
      await client.query(`
      CREATE TABLE IF NOT EXISTS competition (
        id SERIAL PRIMARY KEY,
        hosts TEXT[],
        title TEXT NOT NULL,
        reward TEXT,
        venue TEXT,
        max_participants INTEGER,
        due DATE,
        description TEXT,
        banner BYTEA,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);


      // polls
      await client.query(`CREATE TABLE IF NOT EXISTS polls (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);

      // poll_options
      await client.query(`CREATE TABLE IF NOT EXISTS poll_options (
        id SERIAL PRIMARY KEY,
        poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);

      // poll_votes
      await client.query(`CREATE TABLE IF NOT EXISTS poll_votes (
        id SERIAL PRIMARY KEY,
        poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
        option_id INTEGER NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);

      // student_spotlights
      await client.query(`CREATE TABLE IF NOT EXISTS student_spotlights (
        id SERIAL PRIMARY KEY,
        student_name TEXT NOT NULL,
        major TEXT,
        class_year TEXT,
        achievements TEXT,
        quote TEXT,
        image_url TEXT,
        featured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);

      // reward_points
      await client.query(`
        CREATE TABLE IF NOT EXISTS reward_points (
          id SERIAL PRIMARY KEY,
          user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          points INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);


      // calendar_items
      await client.query(`CREATE TABLE IF NOT EXISTS calendar_items (
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
      )`);

      // user_calendar_items
      await client.query(`CREATE TABLE IF NOT EXISTS user_calendar_items (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source_type TEXT NOT NULL,
        source_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        date DATE NOT NULL,
        time TEXT,
        category TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, source_type, source_id)
      )`);

      // community_posts
      await client.query(`CREATE TABLE IF NOT EXISTS community_posts (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT,
        description TEXT NOT NULL,
        tags TEXT[],
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);

      // moderation fields
      await client.query(`ALTER TABLE community_posts
        ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'publish',
        ADD COLUMN IF NOT EXISTS moderation_score DOUBLE PRECISION NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS moderation_meta JSONB`);

      // feedback_submissions
      await client.query(`CREATE TABLE IF NOT EXISTS feedback_submissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        contact_email TEXT,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        attachment_path TEXT,
        attachment_original_name TEXT,
        attachment_mime_type TEXT,
        attachment_size INTEGER,
        status TEXT NOT NULL DEFAULT 'pending',
        moderated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        moderated_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT feedback_submissions_status_check
          CHECK (status IN ('pending', 'in_review', 'resolved'))
      )`);

      // merch_products
      await client.query(`CREATE TABLE IF NOT EXISTS merch_products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        sku TEXT NOT NULL UNIQUE,
        description TEXT,
        category TEXT NOT NULL,
        price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
        stock_qty INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
        image_url TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        is_featured BOOLEAN NOT NULL DEFAULT FALSE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);

      await client.query(`ALTER TABLE merch_products ADD COLUMN IF NOT EXISTS image_url TEXT`);
      
      // merch_orders
      await client.query(`CREATE TABLE IF NOT EXISTS merch_orders (
        id SERIAL PRIMARY KEY,
        purchaser_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        purchaser_name TEXT,
        purchaser_email TEXT,
        purchaser_phone TEXT,
        pickup_option TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        is_paid BOOLEAN NOT NULL DEFAULT FALSE,
        is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
        is_fulfilled BOOLEAN NOT NULL DEFAULT FALSE,
        pickup_ready_at TIMESTAMPTZ NOT NULL DEFAULT (
          NOW() + INTERVAL '2 days' + (
            CASE
              WHEN COALESCE(current_setting('murdoch.randomize_pickup_ready', true), 'false')::BOOLEAN
                THEN FLOOR(random() * 4)::INT * INTERVAL '1 day'
              ELSE INTERVAL '0 days'
            END
          )
        ),
        subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
        tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
        total NUMERIC(12,2) NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);

      // merch_order_items
      await client.query(`CREATE TABLE IF NOT EXISTS merch_order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES merch_orders(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES merch_products(id) ON DELETE RESTRICT,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
        line_total NUMERIC(12,2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);

      // indexes
      await client.query(`CREATE INDEX IF NOT EXISTS campus_events_start_time_idx ON campus_events (start_time)`);
      await client.query(`CREATE INDEX IF NOT EXISTS calendar_items_start_time_idx ON calendar_items (start_time)`);
      await client.query(`CREATE INDEX IF NOT EXISTS user_calendar_items_user_id_date_idx ON user_calendar_items (user_id, date, time)`);
      await client.query(`CREATE INDEX IF NOT EXISTS community_posts_created_at_idx ON community_posts (created_at DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS community_posts_moderation_idx ON community_posts (moderation_status, created_at DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS feedback_submissions_status_idx ON feedback_submissions (status, created_at DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS merch_products_category_idx ON merch_products (category)`);
      await client.query(`CREATE INDEX IF NOT EXISTS merch_orders_status_idx ON merch_orders (status)`);

      await seedDashboardData(client);
      await seedMerchandiseData(client);
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.code === '3D000' && !process.env.DATABASE_URL) {
      console.warn(`Database "${poolConfig.database}" was not found. Attempting to create it...`);
      await createDatabaseIfMissing();
      await pool.end().catch(() => {});
      pool = new Pool(poolConfig);
      await ensureDatabase();
      return;
    }

    if (error.code === '28P01') {
      console.error('PostgreSQL rejected credentials. Check PGUSER/PGPASSWORD.');
    }

    throw error;
  }
};

module.exports = { getPool, ensureDatabase };
