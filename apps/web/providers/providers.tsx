import React from 'react'
import { RootLayout } from './fuma-provider'
import { ThemeProvider } from './theme-provider'


const providers = ({ children }: { children: React.ReactNode }) => {
    return (
        <>
            <RootLayout>
                <ThemeProvider>
                    {children}
                </ThemeProvider>
            </RootLayout>
            
        </>
    )
}

export default providers