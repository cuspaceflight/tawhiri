open Core.Std

type ds_arr = (float, Bigarray.float64_elt, Bigarray.c_layout) Bigarray.Genarray.t

type ro
type rw
type 'a mode = RO | RW
let ro = (RO : ro mode)
let rw = (RW : rw mode)

type 'a t = Time.t * ds_arr

(* XXX this needs the system clock to be UTC *)
(* XXX location hardcoded *)
let filename dstime = Time.format dstime "/var/www/predict/tawhiri/datasets/%Y%m%d%H"
let shape = (65, 47, 3, 361, 720)
let shape_arr = let a, b, c, d, e = shape in [|a;b;c;d;e|]

let create dstime mode =
    let module BA = Bigarray in
    let unix_mode, shared =
        match mode with
        | RW -> ([Unix.O_RDWR; Unix.O_CREAT], true)
        | RO -> ([Unix.O_RDONLY], false)
    in
    let arr = Unix.with_file (filename dstime) ~mode:unix_mode ~f:(fun fd ->
        BA.Genarray.map_file fd BA.float64 BA.c_layout shared shape_arr
    ) in
    (dstime, arr)

let get (_, arr) = Bigarray.Genarray.get arr
let set (_, arr) = Bigarray.Genarray.set arr
let dstime = fst

let find_recent () =
    let n = Time.now () in
    let i = Time.Span.scale Time.Span.hour 6. in
    (* XXX this needs the system clock to be UTC *)
    let start = Time.next_multiple ~base:Time.epoch ~after:n ~interval:i () in
    let try_open x = Option.try_with (fun () -> create x ro) in
    List.range ~stride:6 0 23
    |> List.map ~f:(fun i -> Float.of_int i
                             |> Time.Span.scale Time.Span.hour
                             |> Time.sub start)
    |> List.find_map ~f:try_open
    (* there must be a nicer way to erase the remaining optional args... *)
    |> (fun x -> Option.value_exn ~message:"Couldn't find any recent dataset" x)
