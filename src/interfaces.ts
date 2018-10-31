import { Record } from "@subspace/database"
import { ISignatureObject } from "@subspace/tracker/dist/interfaces";

export interface IRecordObject {
  key: string,
  value: Record['value']
}

export interface IPutRequest {
  record: IRecordObject
  contractKey: string
  timestamp: number
  signature: string
}

export interface IPutResponse {
  valid: boolean
  reason: string
  key: string
}

export interface IGetRequest {
  shardId: string
  recordId: string
  replicationFactor: number
}

export interface IGetResponse {
  valid: boolean
  key: string
  reason: string
  record?: IRecordObject
}

export interface IRevRequest {
  record: IRecordObject
  contractKey: string
  shardId: string
  timestamp: number
  signature: string
}

export interface IRevResponse {
  valid: boolean
  reason: string
  key: string
}

export interface IDelRequest {
  shardId: string
  recordId: string
  replicationFactor: number 
  contractKey: string
  signature: string
}

export interface IDelResponse {
  valid: boolean
  reason: string
  key: string
}

export interface IContractRequest {
  tx: IRecordObject
  contract: IRecordObject
  signature: string
}

export interface IContractResponse {
  valid: boolean
  reason: string
  key: string
}

export interface INeighborRequest {
  pledgeTxId: string
}

export interface INeighborResponse {
  valid: boolean
  reason: string
  proof: INeighborProof
}

export interface INeighborProof {
  host: string
  neighbor: string
  timestamp: number
  signature: string
}

export interface IShardRequest {
  shardId: string
  contractRecordId: string
}

export interface IShardResponse {
  valid: boolean
  reason: string
  shardId: string
  contractId: string
  records: Record[]
}

export interface IPendingFailure {
  neighbors: Set<string>
  signatures: ISignatureObject[]
  createdAt: number
}

