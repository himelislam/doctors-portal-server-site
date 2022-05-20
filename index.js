const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { query } = require('express');
const app = express();
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;


// middleware
app.use(cors())
app.use(express.json())

// middletare
function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    console.log(authHeader);
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorides Access' })
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: 'Forbidden Access' })
        }
        req.decoded = decoded;
        next();
    })
}




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cwcwn.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        const servicesCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        const userCollection = client.db('doctors_portal').collection('users');
        const doctorCollection = client.db('doctors_portal').collection('doctors');
        const paymentCollection = client.db('doctors_portal').collection('payments');


        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            console.log(requester);
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ messege: 'Forbidden Access' })
            }
        }


        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query).project({ name: 1 })
            const services = await cursor.toArray()
            res.send(services)
        })

        app.get('/available', async (req, res) => {
            const date = req.query.date

            // step 1 : get all services
            const services = await servicesCollection.find().toArray();

            // step 2: get all the bookings of this date
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            // step 3: for each of the service, find bookings of that service
            services.forEach(service => {
                const serviceBooking = bookings.filter(b => b.treatment === service.name);
                const booked = serviceBooking.map(s => s.slot);
                const available = service.slots.filter(s => !booked.includes(s));
                // service.available = available; or
                service.slots = available;
                // service.booked = booked
                // service.booked = serviceBooking.map(s=> s.slot);
            })

            res.send(services);
        })


        app.post('/create-payment-intent', verifyToken,  async (req, res)=>{
            const service = req.body;
            console.log(service)
            const price = service.price;
            const amount = price*100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount : amount,
                currency : 'usd',
                payment_method_types: ['card']
            });
            res.send({clientSecret: paymentIntent.client_secret})
        })


        // for bookings
        app.get('/booking', verifyToken, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                const query = { patient: patient }
                const booking = await bookingCollection.find(query).toArray();
                return res.send(booking)
            }
            else {
                return res.status(403).send({ message: 'Forbidden Access' })
            }

        })


        app.get('/booking/:id', async(req, res)=>{
            const id = req.params.id;
            const query = {_id: ObjectId(id)};
            const booking = await bookingCollection.findOne(query);
            res.send(booking);
        })

        app.get('/users', verifyToken, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        })

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin });
        })

        app.put('/user/admin/:email', verifyToken, verifyAdmin, async (req, res) => {
            const email = req.params.email;

            const filter = { email: email }
            const updatedDoc = {
                $set: {
                    role: 'admin'
                },
            }
            const result = await userCollection.updateOne(filter, updatedDoc)
            res.send(result)
        })


        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email }
            const options = { upsert: true };
            const updatedDoc = {
                $set: user,
            }
            const result = await userCollection.updateOne(filter, updatedDoc, options)
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '2h' })
            res.send({ result, token })
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking)
            return res.send({ success: true, result })
        });

        app.patch('/booking/:id', async (req, res)=>{
            const id = req.params.id;
            const payment = req.body;
            const filter = {_id:ObjectId(id)};
            const updatedDoc = {
                $set:{
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const result = await paymentCollection.insertOne(payment);
            const updatedBooking = await bookingCollection.updateOne(filter, updatedDoc);
            res.send(updatedBooking);
        })


        // for doctors
        app.get('/doctor', verifyToken, verifyAdmin, async (req,res)=>{
            const doctors = await doctorCollection.find().toArray();
            res.send(doctors)
        })

        app.post('/doctor', verifyToken, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            console.log(doctor);
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);
        });


        app.delete('/doctor/:email', verifyToken, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = {email: email}
            const result = await doctorCollection.deleteOne(filter);
            res.send(result);
        });
    }
    finally {

    }
}


run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Hello From Doctors portal server site')
})

app.listen(port, () => {
    console.log('Listening doctors portal', port);
})