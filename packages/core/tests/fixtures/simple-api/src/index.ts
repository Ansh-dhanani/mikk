import { authMiddleware } from './auth/middleware'

const app = {
    use: (handler: any) => { },
    listen: (port: number) => console.log(`Listening on ${port}`)
}

app.use(authMiddleware)
app.listen(3000)
