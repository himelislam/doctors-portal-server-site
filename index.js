const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const { query } = require('express');
const app = express();
require('dotenv').config()
const port = process.env.PORT || 5000;


// middleware
app.use(cors())
app.use(express.json())




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cwcwn.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run(){
    try{
        await client.connect();
        const servicesCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');


        app.get('/service', async(req, res)=>{
            const query = {};
            const cursor = servicesCollection.find(query)
            const services = await cursor.toArray()
            res.send(services)
        })

        app.get('/available', async (req, res)  => {
            const date = req.query.date
            
            // step 1 : get all services
            const services = await servicesCollection.find().toArray();

            // step 2: get all the bookings of this date
            const query = {date:date};
            const bookings = await bookingCollection.find(query).toArray();

            // step 3: for each of the service, find bookings of that service
            services.forEach(service => {
                const serviceBooking = bookings.filter(b => b.treatment === service.name);
                const booked = serviceBooking.map(s=> s.slot);
                const available = service.slots.filter(s=>!booked.includes(s));
                // service.available = available; or
                service.slots = available;
                // service.booked = booked
                // service.booked = serviceBooking.map(s=> s.slot);
            })
            
            res.send(services); 
        })

        // for bookings
        app.post('/booking', async (req, res)=>{
            const booking = req.body;
            const query = {treatment: booking.treatment, date: booking.date, patient: booking.patient}
            const exists = await bookingCollection.findOne(query);
            if(exists){
                return res.send({success: false, booking: exists})
            }
            const result = await bookingCollection.insertOne(booking)
            return res.send({success: true, result})
        })
    }
    finally{

    }
}


run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Hello From Doctors portal server site')
})

app.listen(port, () => {
    console.log('Listening doctors portal', port);
})