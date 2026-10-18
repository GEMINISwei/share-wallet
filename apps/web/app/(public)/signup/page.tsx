import { SignupPage, generateSignupMetadata, type SignupPageProps } from "@/modules/auth/public.server"

export const generateMetadata = generateSignupMetadata

export default function Page(props: SignupPageProps) {
  return <SignupPage {...props} />
}
