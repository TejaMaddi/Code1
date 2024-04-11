const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const app = express()
app.use(express.json())
const dbpath = path.join(__dirname, 'twitterClone.db')
let db = null
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is running at http://localhost:3000')
    })
  } catch (e) {
    console.log(`DBERROR:${e.message}`)
    process.exit(1)
  }
}
initializeDBAndServer()

const getFollowingpeople = async username => {
  const query = `
    SELECT following_user_id from follower 
    INNER JOIN user ON user.user_id=follower.follower_user_id
    WHERE user.username='${username}'
  `
  const followingId = await db.all(query)
  const arrayOfId = followingId.map(i => i.following_user_id)
  return arrayOfId
}

const authenticateToken = (request, response, next) => {
  let jwtToken
  const aurthHeader = request.headers['authorization']
  if (aurthHeader !== undefined) {
    jwtToken = aurthHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Toekn')
  } else {
    jwt.verify(jwtToken, 'Secret', async (error, payload) => {
      if (error) {
        response.status(400)
        response.send('Invalid JWT Token')
      } else {
        request.username=payload.username;
        request.userId=payload.userId;
        next()
      }
    })
  }
}
const tweetAccessVerification=async(request,response,next)=> {
  const {userId}=request;
  const {tweetId}=request.params;
  const getTweetQuery=`
    SELECT * FROM tweet INNER JOIN follower ON tweet.user_id=follower.following_user_id
    WHERE
    tweet.tweet_id='${tweetId}' AND follower_user_id='${userId}'
  `
  const tweet2=await db.get(getTweetQuery);
  if(tweet2===undefined) {
    response.status(401);
    response.send("Invalid request");
  }else {
    next();
  }
}
//API-1
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const selectUser = `
        SELECT * FROM user WHERE username='${username}
    `
  const res = await db.get(selectUser)
  if (res === undefined) {
    if (password.length > 5) {
      const hashedPassword = await bcrypt.hash(password, 10)
      const createUser = `
                INSERT INTO user(username,password,name,gender)
                VALUES(
                    '${username}',
                    '${hashedPassword}',
                    '${name}',
                    '${gender}'
                )
            `
      await db.run(createUser)
      response.send('User created successfully')
    } else {
      response.status(400)
      response.send('Password is too short')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})
//API-2
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const getUser = `
  SELECT * FROM user where username='${username}`
  const resp = await db.get(getUser)
  if (resp === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isMatched = await bcrypt.compare(password, resp.password)
    if (isMatched === true) {
      const payload = {username, userId: resp.user_id}
      const jwtToken = jwt.sign(payload, 'Secret')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})
//API-3
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request
  const followingId = await getFollowingpeople(username)
  const getTweets = `
      SELECT username,tweet,date_time as dateTime
      FROM user INNER JOIN tweet
      ON user.user_id=tweet.user_id
      WHERE user.user_id IN (${followingId})
      ORDER BY date_time DESC
      LIMIT 4
    `
  const tweets = await db.all(getTweets)
  response.send(tweets)
})
//API-4
app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username, userId} = request
  const query1 = `
    SELECT name from follower INNER JOIN user ON user.user_id=follower.following_user_id
    WHERE follower_user_id='${userId}'
  `
  const dbresp = await db.all(query1)
  response.send(dbresp)
})
//API-5
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username, userId} = request
  const query2 = `
      SELECT DISTINCT name from user INNER JOIN follower ON user.user_id=follower.follower_user_id
      WHERE following_user_id='${userId}'
    `
  const api5 = await db.all(query2)
  response.send(api5)
})
//API-6
app.get('/tweets/:tweetId/', authenticateToken,tweetAccessVerification, async (request, response) => {
  const {tweetId} = request.params
  const {username, userId} = request
  const query3 = `
    SELECT tweet,
    (SELECT COUNT() FROM LIKE where tweet_id='${tweetId}') AS likes,
    (SELECT COUNT() FROM REPLY WHERE tweet_id='${tweetId}') AS replies
    date_time as dateTime
    from tweet
    where TWEET.tweet_id='${tweetId}'
  `
  const api6 = await db.get(query3)
  response.send(api6)
})
//API-7
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,tweetAccessVerification,
  async (request, response) => {
    const {tweetId} = request.params
    const query4 = `
    SELECT username FROM user INNER JOIN like ON user.user_id=like.user_id
    WHERE tweet_id='${tweetId}'
   `
    const api7 = await db.all(query4)
    const userr = api7.map(i => i.username)
    response.send({likes: userr})
  },
)
//API-8
app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,tweetAccessVerification,
  async (request, response) => {
    const {tweetId} = request.params
    const getReply = `
    SELECT name,reply FROM user INNER JOIN reply 
    on user.user_id=reply.user_id
    WHERE tweet_id='${tweetId}'
   `
    const api8 = await db.all(getReply)
    response.send({replies: api8})
  },
)
//API-9
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {username, userId} = request
  const query8 = `
    SELECT tweet,
    COUNT(DISTINCT like_id) AS likes,
    COUNT(DISTINCT reply_id) AS replies,
    date_time as dateTime
    FROM tweet LEFT JOIN reply ON tweet.tweet_id=reply.tweet_id LEFT JOIN  like ON tweet.tweet_id=like.tweet_id
    WHERE tweet.user_id='${userId}'
    GROUP BY tweet.tweet_id;
    `
  const tweets = await db.all(query8)
  response.send(tweets)
})
//API-10
app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {tweet} = request.body
  const postQuery = `
      INSERT INTO tweet(tweet)
      VALUES(
        '${tweet}'
      )
  `
  await db.run(postQuery)
  response.send('Created a Tweet')
})
//api-11
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {userId} = request
    const getTweet = `
    SELECT * from tweet WHERE user_id='${userId}' AND tweet_id='${tweetId}'
  `
    const tweet1 = await db.get(getTweet)
    if (tweet1 === undefined) {
      response.status(401)
      response.send('Invalid request')
    } else {
      const deleteQuery = `
      DELETE FROM tweet WHERE tweet_id='${tweetId}'
    `
      await db.run(deleteQuery)
      response.send('Tweet Removed')
    }
  },
)

module.exports = app;